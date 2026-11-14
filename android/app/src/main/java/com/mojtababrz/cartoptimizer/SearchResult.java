package com.mojtababrz.cartoptimizer;

import android.content.Context;
import android.content.Intent;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Avoid Android's Binder limit for image/store metadata; private, bounded, one-use files. */
final class SearchResult {
    private static final int MAX=10_000_000;
    private static File folder(Context c){return new File(c.getCacheDir(),"search-results");}
    static Intent pack(Context c,String json)throws Exception{
        byte[] b=json.getBytes(StandardCharsets.UTF_8);if(b.length>MAX)throw new IllegalArgumentException("Result too large");
        if(b.length<=400000)return new Intent().putExtra("auto_data",json);
        File dir=folder(c);if(!dir.isDirectory()&&!dir.mkdirs())throw new java.io.IOException();
        String name=java.util.UUID.randomUUID().toString()+".json";Files.write(new File(dir,name).toPath(),b);
        return new Intent().putExtra("auto_result_token",name);
    }
    static String read(Context c,Intent data)throws Exception{
        String inline=data.getStringExtra("auto_data");if(inline!=null){if(inline.getBytes(StandardCharsets.UTF_8).length>MAX)throw new IllegalArgumentException();return inline;}
        String token=data.getStringExtra("auto_result_token");if(token==null||!token.matches("[a-f0-9-]{36}\\.json"))throw new IllegalArgumentException();
        File f=new File(folder(c),token);try{if(f.length()>MAX)throw new IllegalArgumentException();return new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);}finally{f.delete();}
    }
    static void cleanup(Context c){File[] files=folder(c).listFiles();if(files!=null)for(File f:files)if(System.currentTimeMillis()-f.lastModified()>86400000L)f.delete();}
    static void clear(Context c){File[] files=folder(c).listFiles();if(files!=null)for(File f:files)f.delete();}
}
