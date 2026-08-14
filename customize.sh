#!/sbin/sh

SKIPUNZIP=1
ASH_STANDALONE=1

if [ "$BOOTMODE" != true ]; then
  abort "Error: Please install in Magisk Manager, KernelSU Manager or APatch"
fi

if [ "$KSU" = true ] && [ "$KSU_VER_CODE" -lt 10670 ]; then
  abort "Error: Please update your KernelSU"
fi

if [ "$KSU" = true ] && [ "$KSU_VER_CODE" -lt 10683 ]; then
  service_dir="/data/adb/ksu/service.d"
else
  service_dir="/data/adb/service.d"
fi

[ -d "$service_dir" ] || mkdir -p "$service_dir"
unzip -qo "${ZIPFILE}" -x 'META-INF/*' -d "$MODPATH"

if [ -d /data/adb/box ]; then
  cp /data/adb/box/scripts/box.config /data/adb/box/scripts/box.config.bak
  ui_print "- Existing box.config backed up"

  cat /data/adb/box/scripts/box.config >> "$MODPATH/box/scripts/box.config"
  cp -f "$MODPATH"/box/scripts/* /data/adb/box/scripts/
  awk '!x[$0]++' "$MODPATH/box/scripts/box.config" > /data/adb/box/scripts/box.config
  rm -rf "$MODPATH/box"
else
  mv "$MODPATH/box" /data/adb/
fi

# Install the architecture-specific Box4Easy helper. It is a static Linux ELF,
# which runs directly on Android's Linux kernel and needs no bundled libc.
abi="$(getprop ro.product.cpu.abi 2>/dev/null)"
machine="$(uname -m 2>/dev/null)"
case "${abi}:${machine}" in
  arm64-v8a:*|*:aarch64|*:arm64) easy_arch="arm64" ;;
  armeabi-v7a:*|*:armv7l|*:armv8l|*:arm) easy_arch="armv7" ;;
  x86_64:*|*:x86_64|*:amd64) easy_arch="x86_64" ;;
  x86:*|*:i686|*:i386) easy_arch="x86" ;;
  *) abort "Error: Box4Easy unsupported architecture: ${abi:-$machine}" ;;
esac

helper_src="$MODPATH/easy-bin/box4easy-$easy_arch"
[ -f "$helper_src" ] || abort "Error: Box4Easy helper for $easy_arch is missing from ZIP"
mkdir -p /data/adb/box/bin /data/adb/box/easy /data/adb/box/run
cp -f "$helper_src" /data/adb/box/bin/box4easy
chmod 0700 /data/adb/box/bin/box4easy
rm -rf "$MODPATH/easy-bin" "$MODPATH/tools"

if [ "$KSU" = true ]; then
  sed -i 's/name=Box4Easy/name=Box4Easy for KernelSU/g' "$MODPATH/module.prop"
fi
if [ "$APATCH" = true ]; then
  sed -i 's/name=Box4Easy/name=Box4Easy for APatch/g' "$MODPATH/module.prop"
fi

mv -f "$MODPATH/box4_service.sh" "$service_dir/"
rm -f "$MODPATH/customize.sh"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm_recursive /data/adb/box/ 0 0 0755 0644
set_perm_recursive /data/adb/box/scripts/ 0 0 0755 0700
set_perm_recursive /data/adb/box/bin/ 0 0 0755 0700
set_perm "$service_dir/box4_service.sh" 0 0 0700
chmod ugo+x /data/adb/box/scripts/*

for pid in $(pidof inotifyd); do
  if grep -q box.inotify /proc/${pid}/cmdline; then
    kill "$pid"
  fi
done
inotifyd "/data/adb/box/scripts/box.inotify" "$MODPATH" > /dev/null 2>&1 &
