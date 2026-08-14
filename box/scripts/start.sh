#!/system/bin/sh

module_dir="/data/adb/modules/box4"
[ -n "$(magisk -v | grep lite)" ] && module_dir=/data/adb/lite_modules/box4

scripts=$(realpath "$0")
scripts_dir=$(dirname "$scripts")
. "${scripts_dir}/box.config"

wait_until_login() {
    local test_file="/sdcard/Android/.BOX4TEST"
    true > "$test_file"
    while [ ! -f "$test_file" ]; do
        true > "$test_file"
        sleep 1
    done
    rm -f "$test_file"
    while [ ! -f "/data/system/packages.xml" ]; do
        sleep 1
    done
}

fail_safe_cleanup() {
    printf '%s [Error]: startup health check failed; disabling TPROXY\n' "$(date +"%Y-%m-%d %H:%M:%S")" >> "${run_path}/run.log"
    "${scripts_dir}/box.tproxy" -d "${scripts_dir}" stop >> /dev/null 2>> "${run_path}/run.log"
    "${scripts_dir}/box.service" stop >> /dev/null 2>> "${run_path}/run.log"
}

wait_until_login
rm -f "${pid_file}"
mkdir -p "${run_path}"

if [ ! -f "${box_path}/manual" ] && [ ! -f "${module_dir}/disable" ]; then
    mv "${run_path}/run.log" "${run_path}/run.log.bak" 2>/dev/null || true

    if "${scripts_dir}/box.service" start >> /dev/null 2>> "${run_path}/run.log"; then
        if "${scripts_dir}/box.tproxy" -d "${scripts_dir}" start >> /dev/null 2>> "${run_path}/run.log"; then
            sleep 2
            if ! busybox pidof "${bin_name}" > /dev/null 2>&1; then
                fail_safe_cleanup
            fi
        else
            fail_safe_cleanup
        fi
    else
        # Do not apply transparent proxy rules when the core cannot start.
        "${scripts_dir}/box.tproxy" -d "${scripts_dir}" stop >> /dev/null 2>> "${run_path}/run.log"
    fi
fi
