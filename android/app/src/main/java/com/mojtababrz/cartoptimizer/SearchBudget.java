package com.mojtababrz.cartoptimizer;

import android.app.ActivityManager;
import android.content.Context;
import org.json.JSONObject;

/** Available RAM, not installed RAM, limits concurrent renderer work. */
final class SearchBudget {
    static JSONObject read(Context context) {
        ActivityManager manager=(ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();manager.getMemoryInfo(memory);
        long mb=memory.availMem/1048576;int cpu=Runtime.getRuntime().availableProcessors();
        int workers=manager.isLowRamDevice()||memory.lowMemory?1:cpu>=12&&mb>=4096?4:cpu>=8&&mb>=2048?3:cpu>=4&&mb>=1024?2:1;
        JSONObject result=new JSONObject();try{result.put("workers",workers).put("base_carts",3).put("max_carts",3+workers-1).put("state_limit",20000*workers).put("solve_ms",200*workers);}catch(Exception ignored){}
        return result;
    }
}
