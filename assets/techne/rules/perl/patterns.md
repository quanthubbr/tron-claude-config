---
paths:
  - "**/*.pl"
  - "**/*.pm"
  - "**/*.t"
  - "**/*.psgi"
  - "**/*.cgi"
---
# Perl Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Store access

DBI/SQL behind a small class:

```perl
package App::Store::Account;
use Moo;
has dbh => (is => 'ro', required => 1);

sub by_id ($self, $id) {
    my $sth = $self->dbh->prepare('SELECT * FROM accounts WHERE id = ?');
    $sth->execute($id);
    return $sth->fetchrow_hashref;
}
```

## DTOs

Moo + Types::Standard read-only attrs.

## Files

`autodie`; **Path::Tiny** for reads/writes.

## Exports

`Exporter 'import'` with `@EXPORT_OK` only.

## Deps

**cpanfile** + **carton**; `carton exec prove -lr t/`.
