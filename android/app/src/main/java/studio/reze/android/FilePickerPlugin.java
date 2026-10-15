package studio.reze.android;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * FilePicker —— APK 移植：自建文件管理器底层插件。
 *
 * 参考 MikuPlayReburn 的 FilePickerPlugin 设计：应用内文件浏览器（列表 / 返回上级 /
 * 读取文件）直接操作 Android 文件系统。本项目目标为 Android 12+，权限模型是
 * MANAGE_EXTERNAL_STORAGE（"全部文件访问权"，MainActivity 启动时引导授予），
 * 因此 checkPermissions 以 MANAGE_EXTERNAL_STORAGE 为准，不再依赖
 * READ/WRITE_EXTERNAL_STORAGE 运行时授权。
 *
 * 挂载点：/storage/emulated/0（用户主存储根）。路径白名单限定在用户主存储内，
 * 禁止越权访问 /data、/system 等系统路径。
 */
@CapacitorPlugin(
    name = "FilePicker",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "StorageRead"),
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "StorageWrite")
    }
)
public class FilePickerPlugin extends Plugin {

    private static final int REQUEST_CODE_MANAGE_STORAGE = 1001;
    private static final String ROOT_PATH = "/storage/emulated/0";
    private static final String CANONICAL_ROOT;

    static {
        String root;
        try {
            root = new File(ROOT_PATH).getCanonicalPath();
        } catch (IOException e) {
            root = ROOT_PATH;
        }
        CANONICAL_ROOT = root;
    }

    /** 路径是否在可访问范围内（用户主存储根及其子目录）。 */
    private boolean isPathAllowed(String path) {
        if (path == null || path.isEmpty()) return false;
        try {
            String canonical = new File(path).getCanonicalPath();
            return canonical.equals(CANONICAL_ROOT) || canonical.startsWith(CANONICAL_ROOT + File.separator);
        } catch (IOException e) {
            return false;
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+：全部文件访问权（MANAGE_EXTERNAL_STORAGE）
            boolean granted = Environment.isExternalStorageManager();
            result.put("granted", granted);
        } else {
            // Android 10 及以下：读写存储权限
            boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
                    && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            result.put("granted", granted);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
                return;
            }
            // 跳系统设置页授予"全部文件访问权"
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            try {
                startActivityForResult(call, intent, "storagePermissionResultActivity");
            } catch (Exception e) {
                // 部分 ROM 不支持该精确 Intent，回退到总设置页
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                try {
                    startActivityForResult(call, fallback, "storagePermissionResultActivity");
                } catch (Exception e2) {
                    call.reject("无法打开存储权限设置: " + e2.getMessage());
                }
            }
        } else {
            // Android 10 及以下：运行时请求读写权限（Capacitor 8：按注解别名请求）
            requestPermissionForAliases(new String[]{ "StorageRead", "StorageWrite" }, call, "legacyStorageResult");
        }
    }

    @PermissionCallback
    private void legacyStorageResult(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ret.put("granted", Environment.isExternalStorageManager());
        } else {
            boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            ret.put("granted", granted);
        }
        call.resolve(ret);
    }

    @ActivityCallback
    private void storagePermissionResultActivity(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ret.put("granted", Environment.isExternalStorageManager());
        } else {
            boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            ret.put("granted", granted);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String path = call.getString("path", ROOT_PATH);

        if (!isPathAllowed(path)) {
            call.reject("无权访问该路径: " + path);
            return;
        }

        File directory = new File(path);
        if (!directory.exists() || !directory.isDirectory()) {
            call.reject("路径不存在或不是目录: " + path);
            return;
        }

        File[] files = directory.listFiles();
        JSArray filesArray = new JSArray();

        if (files != null) {
            for (File file : files) {
                JSObject fileObj = new JSObject();
                fileObj.put("name", file.getName());
                fileObj.put("path", file.getAbsolutePath());
                fileObj.put("isDirectory", file.isDirectory());

                if (!file.isDirectory()) {
                    fileObj.put("size", file.length());
                    fileObj.put("extension", getFileExtension(file.getName()));
                    long lastModified = file.lastModified();
                    fileObj.put("lastModified", lastModified);
                }

                filesArray.put(fileObj);
            }
        }

        JSObject result = new JSObject();
        result.put("files", filesArray);
        call.resolve(result);
    }

    @PluginMethod
    public void getParentPath(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("路径不能为空");
            return;
        }

        File file = new File(path);
        File parent = file.getParentFile();

        JSObject result = new JSObject();
        if (parent != null && isPathAllowed(parent.getAbsolutePath())) {
            result.put("parentPath", parent.getAbsolutePath());
        } else {
            result.put("parentPath", ROOT_PATH);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("路径不能为空");
            return;
        }

        if (!isPathAllowed(path)) {
            call.reject("无权访问该路径: " + path);
            return;
        }

        File file = new File(path);
        if (!file.exists() || file.isDirectory()) {
            call.reject("文件不存在或是目录: " + path);
            return;
        }

        try {
            byte[] fileBytes = java.nio.file.Files.readAllBytes(file.toPath());
            String base64Data = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP);

            JSObject result = new JSObject();
            result.put("data", base64Data);
            result.put("mimeType", getMimeType(file.getName()));
            call.resolve(result);
        } catch (IOException e) {
            call.reject("读取文件失败: " + e.getMessage());
        }
    }

    private String getFileExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot >= 0 && lastDot < fileName.length() - 1) {
            return fileName.substring(lastDot + 1);
        }
        return "";
    }

    private String getMimeType(String fileName) {
        String ext = getFileExtension(fileName).toLowerCase();
        switch (ext) {
            case "pmx":
            case "pmd":
            case "bpmx":
            case "vmd":
                return "application/octet-stream";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "bmp":
                return "image/bmp";
            case "tga":
                return "image/x-tga";
            case "mp3":
                return "audio/mpeg";
            case "wav":
                return "audio/wav";
            default:
                return "application/octet-stream";
        }
    }
}
