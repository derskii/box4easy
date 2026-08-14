#!/bin/sh
set -e
zip -r -o -X -ll "box4easy_$(grep '^version=' module.prop | awk -F '=' '{print $2}').zip" ./ \
  -x '.git/*' -x 'build.sh' -x '.github/*' -x 'box4.json' -x 'webui/*' -x 'tools/*' -x 'ui.ts'
