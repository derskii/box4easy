#!/bin/sh
set -eu
cd "$(dirname "$0")"
cat source/main.go.part.* > main.go
gofmt -w main.go
