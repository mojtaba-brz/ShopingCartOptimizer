# Native methods called by the packaged, isolated planner WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
