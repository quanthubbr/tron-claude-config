#!/bin/sh
set -eu
umask 077

fail() { printf 'exonous: %s\n' "$*" >&2; exit 1; }
for tool in curl tar gzip mktemp dd od awk wc; do
    command -v "$tool" >/dev/null 2>&1 || fail "required command unavailable: $tool"
done
if command -v sha256sum >/dev/null 2>&1; then
    hash() { sha256sum "$1"; }
elif command -v shasum >/dev/null 2>&1; then
    hash() { shasum -a 256 "$1"; }
else
    fail 'SHA-256 requires sha256sum or shasum'
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
release=$(curl --disable --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error \
    --location --max-redirs 5 --connect-timeout 15 --max-time 120 \
    --head --output /dev/null --write-out '%{url_effective}' \
    https://github.com/zaqueu-1/exonous/releases/latest)
version=$(printf '%s\n' "$release" | awk '
    /^https:\/\/github[.]com\/zaqueu-1\/exonous\/releases\/tag\/v(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$/ {
        sub(/^.*\/v/, ""); print
    }')
[ -n "$version" ] || fail 'latest release did not resolve to a stable Exonous tag'
filename="exonous-$target.tar.gz"
base="https://github.com/zaqueu-1/exonous/releases/download/v$version"
fetch "$base/SHA256SUMS" "$stage/SHA256SUMS" 65536
expected=$(awk -v name="$filename" '
    { file=$2; sub(/^\*/, "", file) }
    file == name {
        count++
        if (NF != 2 || length($1) != 64 || $1 !~ /^[[:xdigit:]]+$/) bad=1
        value=tolower($1)
    }
    END { if (count != 1 || bad) exit 1; print value }
' "$stage/SHA256SUMS") || fail 'checksum manifest must contain one exact SHA-256 entry'
fetch "$base/$filename" "$stage/$filename" 134217728
actual=$(hash "$stage/$filename")
actual=${actual%% *}
[ "$actual" = "$expected" ] || fail 'native bundle checksum verification failed'
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
            if (b[157] != 0 && b[157] != 48) exit 1
            name=field(1,100); prefix=field(346,500)
            if (prefix != "") name=prefix "/" name
            if (name !~ /^[A-Za-z0-9][A-Za-z0-9._+@\/-]*$/ || name ~ /(^|\/)\.\.?($|\/)/ || name ~ /\/\// || name ~ /\/$/) exit 1
            count=split(name,parts,"/")
            for (i=1;i<=count;i++) {
                upper=toupper(parts[i]); sub(/[.].*$/, "", upper)
                if (parts[i] ~ /[.]$/ || upper ~ /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/) exit 1
            }
            if (name !~ /^assets\// && name !~ /^(exonous|package[.]json|Cargo[.]toml|Cargo[.]lock|README[.]md|LICENSE|LICENSE[.]md|THIRD-PARTY-NOTICES[.]md)$/) exit 1
            size=octal(125,136)
            if (size > 134217728) exit 1
            printf "%.0f %s\n",size,name
        }
    ') || fail 'release archive must contain safe regular USTAR files'
    [ "$member" != end ] || break
    size=${member%% *}
    name=${member#* }
    printf '%s\n' "$name" >> "$stage/names"
    entries=$((entries + 1))
    [ "$entries" -le 20000 ] || fail 'release archive has too many entries'
    block=$((block + 1 + (size + 511) / 512))
done
awk '
    { name=tolower($0); if (seen[name]++) exit 1; if ($0 == "exonous") binary=1; if ($0 == "package.json") package=1; if ($0 ~ /^assets\//) assets=1 }
    END {
        if (!binary || !package || !assets) exit 1
        for (name in seen) {
            parent=name
            while (sub(/\/[^\/]*$/, "", parent)) if (seen[parent]) exit 1
        }
    }
' "$stage/names" || fail 'release archive has duplicate paths, parent-file collisions or missing files'
dd if="$stage/release.tar" bs=512 skip="$block" 2>/dev/null | od -An -v -tu1 | awk '{ for(i=1;i<=NF;i++) if ($i != 0) exit 1; count+=NF } END { if (count < 1024) exit 1 }' || fail 'invalid release archive terminator'
mkdir "$stage/bundle"
tar -xf "$stage/release.tar" -C "$stage/bundle"
candidate="$stage/bundle/exonous"
chmod 700 "$candidate"
unset EXONOUS_VERIFIED_RELEASE
EXONOUS_ASSETS="$stage/bundle/assets"
EXONOUS_NO_FORWARD=1
EXONOUS_NO_UPDATE=1
export EXONOUS_ASSETS EXONOUS_NO_FORWARD EXONOUS_NO_UPDATE
[ "$("$candidate" --version)" = "$version" ] || fail 'native executable version does not match release tag'
printf 'Installing Exonous %s...\n' "$version"
"$candidate" install "$@"
