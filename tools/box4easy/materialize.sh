#!/bin/sh
set -eu
cd "$(dirname "$0")"
# RC1 uses normal Go source files (core_*.go). Remove an old generated main.go
# if a developer previously built an alpha checkout, then format the package.
rm -f main.go
gofmt -w core_*.go main_test.go
