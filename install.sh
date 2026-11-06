#!/bin/sh
set -eu
LC_ALL=C
export LC_ALL
umask 077

fail() { printf 'exonous: %s\n' "$*" >&2; exit 1; }
for tool in curl tar gzip mktemp dd od awk wc; do
    command -v "$tool" >/dev/null 2>&1 || fail "required command unavailable: $tool"
done
if command -v sha512sum >/dev/null 2>&1; then
    hash() { sha512sum "$1"; }
elif command -v shasum >/dev/null 2>&1; then
    hash() { shasum -a 512 "$1"; }
else
    fail 'SHA-512 requires sha512sum or shasum'
fi
case "$(uname -s):$(uname -m)" in
    Darwin:arm64|Darwin:aarch64) target=aarch64-apple-darwin ;;
    Darwin:x86_64) target=x86_64-apple-darwin ;;
    Linux:aarch64|Linux:arm64) target=aarch64-unknown-linux-gnu ;;
    Linux:x86_64|Linux:amd64) target=x86_64-unknown-linux-gnu ;;
    *) fail 'no native release bundle for this platform; use install.ps1 on Windows' ;;
esac
stage=$(mktemp -d "${TMPDIR:-/tmp}/exonous-install.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fetch() {
    curl --disable --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error \
        --location --max-redirs 5 --connect-timeout 15 --max-time 120 \
        --max-filesize "$3" --output "$2" "$1"
    [ "$(wc -c < "$2")" -le "$3" ] || fail 'download exceeds size limit'
}
identity() {
    awk -v mode="$2" '
function fail() { bad=1; exit 1 }
function space() { while (substr(raw,p,1) ~ /^[ \t\r\n]$/ && p<=length(raw)) p++ }
function string(key,    result,c,e,h,u,low,i,b,need,min,max) {
    if (substr(raw,p++,1)!="\"") fail()
    result=""
    while (p<=length(raw)) {
        c=substr(raw,p++,1)
        if (c=="\"") return result
        if (c ~ /[[:cntrl:]]/) fail()
        if (c=="\\") {
            if (key) fail()
            e=substr(raw,p++,1)
            if (e ~ /^["\\\/]$/) c=e
            else if (e ~ /^[bfnrt]$/) c="?"
            else if (e=="u") {
                h=substr(raw,p,4); if (length(h)!=4 || h !~ /^[0-9a-fA-F]+$/) fail(); p+=4
                u=0; for(i=1;i<=4;i++) u=u*16+index("0123456789abcdef",tolower(substr(h,i,1)))-1
                if (u>=55296 && u<=56319) {
                    if (substr(raw,p,2)!="\\u") fail(); p+=2; h=substr(raw,p,4)
                    if(length(h)!=4 || h !~ /^[0-9a-fA-F]+$/) fail(); p+=4
                    low=0; for(i=1;i<=4;i++) low=low*16+index("0123456789abcdef",tolower(substr(h,i,1)))-1
                    if(low<56320 || low>57343) fail(); c="?"
                } else { if(u>=56320 && u<=57343) fail(); c=(u>=32 && u<127)?sprintf("%c",u):"?" }
            } else fail()
        } else if (ord[c]>=128) {
            b=ord[c]; need=0; min=128; max=191
            if(b>=194 && b<=223) need=1
            else if(b>=224 && b<=239) { need=2; if(b==224)min=160; if(b==237)max=159 }
            else if(b>=240 && b<=244) { need=3; if(b==240)min=144; if(b==244)max=143 }
            else fail()
            for(i=1;i<=need;i++) { b=ord[substr(raw,p++,1)]; if(b<min || b>max)fail(); min=128; max=191 }
            c=substr(raw,p-need-1,need+1)
        }
        result=result c
    }
    fail()
}
function value(path,depth,    c,id,key,token) {
    if(depth>64)fail(); space(); c=substr(raw,p,1)
    if(c=="{") {
        types[path]="object"; id=++objects; p++; space()
        if(substr(raw,p,1)=="}") {p++;return}
        while(1) {
            space(); key=string(1); if(seen[id SUBSEP key]++)fail(); space()
            if(substr(raw,p++,1)!=":")fail()
            gsub(/~/,"~0",key);gsub(/\//,"~1",key)
            value(path "/" key,depth+1); space(); c=substr(raw,p++,1)
            if(c=="}")return; if(c!=",")fail()
        }
    }
    if(c=="[") {
        p++;space(); if(substr(raw,p,1)=="]"){p++;return}
        while(1){value(path "[]",depth+1);space();c=substr(raw,p++,1);if(c=="]")return;if(c!=",")fail()}
    }
    if(c=="\""){fields[path]=string(0);return}
    token=substr(raw,p)
    if(match(token,/^-?(0|[1-9][0-9]*)([.][0-9]+)?([eE][+-]?[0-9]+)?/)){p+=RLENGTH;return}
    if(substr(token,1,4)=="true" || substr(token,1,4)=="null"){p+=4;return}
    if(substr(token,1,5)=="false"){p+=5;return}
    fail()
}
{ raw=raw $0 "\n"; if(length(raw)>1048576)fail() }
END {
    if(bad)exit 1
    for(i=1;i<=255;i++)ord[sprintf("%c",i)]=i
    p=1;value("",0);space();if(p<=length(raw) || types[""]!="object")fail()
    version=fields["/version"];sha=fields["/gitHead"]
    if(fields["/name"]!="exonous" || version !~ /^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$/ || length(sha)!=40 || sha !~ /^[0-9a-f]+$/)fail()
    print version;print sha
    if(mode=="manifest")exit
    if(types["/dist"]!="object" || fields["/dist/tarball"]!="https://registry.npmjs.org/exonous/-/exonous-" version ".tgz")fail()
    sri=fields["/dist/integrity"];if(substr(sri,1,7)!="sha512-")fail();sri=substr(sri,8)
    if(length(sri)!=88 || substr(sri,87)!="==" || substr(sri,1,86) !~ /^[A-Za-z0-9+\/]+$/ || substr(sri,86,1) !~ /^[AQgw]$/)fail()
    alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";bits=0;count=0;hex=""
    for(i=1;i<=86;i++) {
        bits=bits*64+index(alphabet,substr(sri,i,1))-1;count+=6
        if(count>=8){count-=8;byte=int(bits/(2^count));bits=bits%(2^count);hex=hex sprintf("%02x",byte)}
    }
    if(length(hex)!=128 || bits!=0)fail();print hex
}
' "$1"
}
fetch https://registry.npmjs.org/exonous/latest "$stage/latest" 1048576
identity "$stage/latest" metadata > "$stage/identity" || fail 'invalid npm package metadata'
{ IFS= read -r version; IFS= read -r git_head; IFS= read -r expected; } < "$stage/identity"
filename="exonous-$version.tgz"
fetch "https://registry.npmjs.org/exonous/-/$filename" "$stage/$filename" 134217728
actual=$(hash "$stage/$filename")
actual=${actual%% *}
[ "$actual" = "$expected" ] || fail 'npm package SHA-512 integrity verification failed'
gzip -t "$stage/$filename" || fail 'invalid compressed release archive'
gzip -dc "$stage/$filename" | dd of="$stage/release.tar" bs=1024 count=524289 2>/dev/null
length=$(wc -c < "$stage/release.tar")
[ "$length" -le 536870912 ] || fail 'release archive exceeds expanded size limit'
block=0
entries=0
: > "$stage/names"
while :; do
    [ "$((block * 512 + 512))" -le "$length" ] || fail 'truncated release archive'
    member=$(dd if="$stage/release.tar" bs=512 skip="$block" count=1 2>/dev/null | od -An -v -tu1 | awk '
        function field(start, end,    text,i,ended) {
            text=""
            for (i=start; i<=end; i++) {
                if (b[i] == 0) ended=1
                else { if (ended || b[i] < 32 || b[i] > 126) exit 1; text=text sprintf("%c",b[i]) }
            }
            return text
        }
        function octal(start,end,    value,i,digit,ended) {
            value=0
            for (i=start; i<=end; i++) {
                digit=b[i]
                if (digit == 0 || digit == 32) { ended=1; continue }
                if (ended || digit < 48 || digit > 55) exit 1
                value=value*8+digit-48
            }
            return value
        }
        { for (i=1;i<=NF;i++) b[++n]=$i }
        END {
            if (n != 512) exit 1
            for (i=1;i<=512;i++) total+=b[i]
            if (!total) { print "end"; exit }
            checksum=octal(149,156)
            for (i=149;i<=156;i++) total+=32-b[i]
            if (checksum != total || field(258,263) != "ustar" || field(264,265) != "00") exit 1
            directory=(b[157]==53)
            if (!directory && b[157] != 0 && b[157] != 48) exit 1
            name=field(1,100); prefix=field(346,500)
            if (prefix != "") name=prefix "/" name
            if(directory) sub(/\/$/, "", name)
            if (name !~ /^[A-Za-z0-9][A-Za-z0-9._+@\/-]*$/ || name ~ /(^|\/)\.\.?($|\/)/ || name ~ /\/\// || name ~ /\/$/) exit 1
            count=split(name,parts,"/")
            for (i=1;i<=count;i++) {
                upper=toupper(parts[i]); sub(/[.].*$/, "", upper)
                if (parts[i] ~ /[.]$/ || upper ~ /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/) exit 1
            }
            target="(aarch64-apple-darwin|x86_64-apple-darwin|aarch64-unknown-linux-gnu|x86_64-unknown-linux-gnu|x86_64-pc-windows-msvc)"
            if(directory) {
                if(name!="package" && name!="package/assets" && name!="package/native" && name!="package/bin" && name!~ /^package\/assets\// && name!~ ("^package/native/" target "$")) exit 1
            } else if(name !~ /^package\/assets\// && name !~ /^package\/(package[.]json|README[.]md|LICENSE|LICENSE[.]md|bin\/native[.]cjs)$/ && name !~ /^package\/native\/(aarch64-apple-darwin|x86_64-apple-darwin|aarch64-unknown-linux-gnu|x86_64-unknown-linux-gnu)\/exonous$/ && name!="package/native/x86_64-pc-windows-msvc/exonous.exe") exit 1
            size=octal(125,136)
            if (size > 134217728 || (directory && size != 0)) exit 1
            printf "%.0f %s %s\n",size,directory?"d":"f",name
        }
    ') || fail 'release archive must contain safe regular USTAR files'
    [ "$member" != end ] || break
    size=${member%% *}
    record=${member#* }
    printf '%s\n' "$record" >> "$stage/names"
    entries=$((entries + 1))
    [ "$entries" -le 20000 ] || fail 'release archive has too many entries'
    block=$((block + 1 + (size + 511) / 512))
done
awk -v binary="package/native/$target/exonous" '
    { name=tolower($2); if (seen[name]) exit 1; seen[name]=$1; if ($2 == binary && $1=="f") native=1; if ($2 == "package/package.json" && $1=="f") package=1; if ($2 ~ /^package\/assets\// && $1=="f") assets=1 }
    END {
        if (!native || !package || !assets) exit 1
        for (name in seen) {
            parent=name
            while (sub(/\/[^\/]*$/, "", parent)) if (seen[parent]=="f") exit 1
        }
    }
' "$stage/names" || fail 'npm archive has duplicate paths, parent-file collisions or missing files'
dd if="$stage/release.tar" bs=512 skip="$block" 2>/dev/null | od -An -v -tu1 | awk '{ for(i=1;i<=NF;i++) if ($i != 0) exit 1; count+=NF } END { if (count < 1024) exit 1 }' || fail 'invalid release archive terminator'
mkdir "$stage/bundle"
tar -xf "$stage/release.tar" -C "$stage/bundle"
identity "$stage/bundle/package/package.json" manifest > "$stage/manifest-identity" || fail 'invalid archived npm manifest'
printf '%s\n%s\n' "$version" "$git_head" > "$stage/expected-manifest"
cmp -s "$stage/manifest-identity" "$stage/expected-manifest" || fail 'archived npm manifest does not match registry'
candidate="$stage/bundle/package/native/$target/exonous"
chmod 700 "$candidate"
unset EXONOUS_VERIFIED_RELEASE
EXONOUS_ASSETS="$stage/bundle/package/assets"
EXONOUS_NO_FORWARD=1
EXONOUS_NO_UPDATE=1
export EXONOUS_ASSETS EXONOUS_NO_FORWARD EXONOUS_NO_UPDATE
[ "$("$candidate" --version)" = "$version" ] || fail 'native executable version does not match npm package'
printf 'Installing Exonous %s...\n' "$version"
"$candidate" install "$@"
