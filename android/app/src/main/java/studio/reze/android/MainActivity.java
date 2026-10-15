package studio.reze.android;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Reze Studio Android 入口。
 *
 * APK 移植：启动时请求"全部文件访问权"——
 *  - Android 11+ (API 30+)：需要用户在系统设置里授予"所有文件访问权"
 *    （MANAGE_EXTERNAL_STORAGE）。App 启动时检查未授予则跳转设置页引导开启。
 *  - Android 10 及以下：使用传统 READ_EXTERNAL_STORAGE 运行时请求。
 */
public class MainActivity extends BridgeActivity {

    /** Android 11+ 的设置页跳转（"所有文件访问权"）。 */
    private final ActivityResultLauncher<Intent> manageStorageLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                // 用户从设置页返回，无需强制处理——后续载入模型时若仍无权限会再次引导。
            });

    @Override
    public void onStart() {
        super.onStart();
        requestAllFilesAccess();
    }

    private void requestAllFilesAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    manageStorageLauncher.launch(intent);
                } catch (Exception e) {
                    try {
                        manageStorageLauncher.launch(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                    } catch (Exception ignored) {
                    }
                }
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                        Manifest.permission.READ_EXTERNAL_STORAGE,
                        Manifest.permission.WRITE_EXTERNAL_STORAGE,
                }, 1001);
            }
        }
    }
}
