#!/sbin/sh

module_dir="/data/adb/modules/box4"

[ -n "$(magisk -v | grep lite)" ] && module_dir=/data/adb/lite_modules/box4

scripts_dir="/data/adb/box/scripts"
run_dir="/data/adb/box/run"
easy_dir="/data/adb/box/easy"

# Box4Easy 1.0 first-boot safety: do not automatically start a stale alpha
# config after upgrade. The helper removes /data/adb/box/manual only after a
# subscription/server has been parsed and the generated core config validated.
mkdir -p "$easy_dir"
if [ ! -f "$easy_dir/v1.activated" ]; then
  touch /data/adb/box/manual
fi

(
until [ "$(getprop sys.boot_completed)" = "1" ] ; do
  sleep 3
done
${scripts_dir}/start.sh
)&

inotifyd ${scripts_dir}/box.inotify ${module_dir} > /dev/null 2>&1 &
mkdir -p ${run_dir}/webui_service_queue
rm -f ${run_dir}/webui_service_queue/* 2>/dev/null
inotifyd ${scripts_dir}/webui_service.inotify ${run_dir}/webui_service_queue:nw > /dev/null 2>&1 &

while [ ! -f /data/misc/net/rt_tables ] ; do
  sleep 3
done

net_dir="/data/misc/net"
# Monitor network changes without polling /proc.
inotifyd ${scripts_dir}/net.inotify ${net_dir} > /dev/null 2>&1 &
inotifyd ${scripts_dir}/ctr.inotify /data/misc/net/rt_tables &>/dev/null &
