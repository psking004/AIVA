package com.aiva.personal.ai

import android.app.Application
import android.content.res.Configuration
import androidx.annotation.NonNull

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.config.ReactFeatureFlags
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.flipper.ReactNativeFlipper
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

import android.util.Log

class MainApplication : Application(), ReactApplication {

  companion object {
    private const val TAG = "AIVA_NATIVE"
  }

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            Log.i(TAG, "ReactNativeHost getPackages initializing")
            return PackageList(this).packages.toMutableList().apply { add(com.aiva.personal.ai.wakeword.AivaWakeWordPackage()) }
          }

          override fun getJSMainModuleName(): String = "index"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED

          override fun getBundleAssetName(): String? {
            val assetName = super.getBundleAssetName()
            Log.i(TAG, "ReactNativeHost getBundleAssetName: $assetName")
            return assetName
          }

          override fun getJSBundleFile(): String? {
            val bundleFile = super.getJSBundleFile()
            Log.i(TAG, "ReactNativeHost getJSBundleFile: $bundleFile")
            return bundleFile
          }
      }
  )

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    Log.i(TAG, "MainApplication onCreate: initializing SoLoader")
    super.onCreate()
    SoLoader.init(this, false)
    Log.i(TAG, "MainApplication SoLoader initialized")
    if (!BuildConfig.REACT_NATIVE_UNSTABLE_USE_RUNTIME_SCHEDULER_ALWAYS) {
      ReactFeatureFlags.unstable_useRuntimeSchedulerAlways = false
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    if (BuildConfig.DEBUG) {
      ReactNativeFlipper.initializeFlipper(this, reactNativeHost.reactInstanceManager)
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    Log.i(TAG, "MainApplication onCreate completed")
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
