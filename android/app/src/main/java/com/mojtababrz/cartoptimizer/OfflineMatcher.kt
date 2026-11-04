package com.mojtababrz.cartoptimizer

import android.app.ActivityManager
import android.content.Context
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.SamplerConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** On-device suggestions only: model output never authorises purchases or supplies prices. */
class OfflineMatcher(private val context: Context) {
    companion object { private val modelLock=Any() }
    private val digest = "2a72330b504a6596d53a2c00923c57173b10f1b83e6a541213ffec08d1fc5de8"
    private val modelUrl = "https://huggingface.co/litert-community/Qwen3-1.7B/resolve/87603f0ff3fe74b9b77ed0477edb773b4b596f32/Qwen3-1.7B_dynamic_wi4b32_afp32.litertlm"
    private val file = File(context.filesDir, "qwen3-1.7b-int4.litertlm")

    private fun hash(file: File): String {
        val md=MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input -> val b=ByteArray(65536); while(true) { if(Thread.currentThread().isInterrupted)throw InterruptedException();val n=input.read(b); if(n<0) break; md.update(b,0,n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
    private fun prepare() = synchronized(modelLock) {
        if(file.exists() && hash(file)==digest)return
        if(context.filesDir.usableSpace<1200000000L)throw IllegalStateException("Not enough space for offline model")
        val temp=File(context.filesDir,"offline-model.download")
        temp.delete()
        try {
            val conn=URL(modelUrl).openConnection() as HttpURLConnection
            conn.connectTimeout=20000;conn.readTimeout=30000;conn.instanceFollowRedirects=true
            try {
                if(conn.responseCode !in 200..299 || conn.url.protocol!="https") throw IllegalStateException("Model download unavailable")
                var total=0L
                conn.inputStream.buffered().use { input -> temp.outputStream().buffered().use { out ->
                    val b=ByteArray(65536);while(true) { if(Thread.currentThread().isInterrupted)throw InterruptedException();val n=input.read(b);if(n<0)break;total+=n;if(total>1200000000L)throw IllegalStateException("Model too large");out.write(b,0,n) }
                } }
            } finally { conn.disconnect() }
            if(hash(temp)!=digest)throw IllegalStateException("Model checksum mismatch")
            if(!temp.renameTo(file))throw IllegalStateException("Could not save model")
        } finally { temp.delete() }
    }
    fun suggest(payload: String, items: String): String {
        val results=JSONObject(payload).getJSONArray("items")
        val requested=JSONArray(items)
        val memory=ActivityManager.MemoryInfo();(context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(memory)
        if(memory.availMem<3100000000L) throw IllegalStateException("Not enough free memory for offline AI")
        prepare()
        val output=JSONArray()
        val engine=Engine(EngineConfig(modelPath=file.absolutePath,backend=Backend.CPU(),maxNumTokens=1024))
        engine.initialize()
        fun answer(request: String,title: String): String {
            val prefix="فقط یک کلمه بله یا خیر بنویس. مثال: خرید برنج، محصول صابون: خیر. خرید برنج، محصول برنج یک کیلو: بله. "
            val prompt=prefix+"خرید "+request+"، محصول "+title+":"
            val config=ConversationConfig(samplerConfig=SamplerConfig(topK=1,topP=1.0,temperature=0.0),extraContext=mapOf("enable_thinking" to false))
            return engine.createConversation(config).use { it.sendMessage(prompt).toString() }
                .replace(Regex("<think>.*?</think>",RegexOption.DOT_MATCHES_ALL),"").trim()
        }
        fun yes(s: String)=s.matches(Regex("(?:بله|آری)[.!؟]?"))
        fun no(s: String)=s.matches(Regex("(?:خیر|نه)[.!؟]?"))
        val deadline=System.nanoTime()+90000000000L
        try {
            if(!yes(answer("شیر کم چرب","شیر کم چرب یک لیتر")) || !no(answer("شیر کم چرب","مایع ظرفشویی")))
                throw IllegalStateException("Offline model did not pass its matching self-check")
            data class Job(val wanted: JSONObject,val products: JSONArray,val matched: JSONArray=JSONArray(),val seen: HashSet<String> = HashSet(),var examined: Int=0)
            val jobs=ArrayList<Job>()
            for(i in 0 until requested.length()) {
                val wanted=requested.getJSONObject(i)
                val result=(0 until results.length()).map { results.getJSONObject(it) }.firstOrNull { it.optString("id")==wanted.getString("id") } ?: continue
                jobs.add(Job(wanted,result.optJSONArray("products")?:JSONArray()))
            }
            // Share the time budget between shopping-list items rather than
            // spending it all on the first item.
            while(System.nanoTime()<deadline && jobs.any { it.examined<minOf(it.products.length(),120) }) {
                for(job in jobs) {
                    if(System.nanoTime()>=deadline)break
                    if(job.examined>=minOf(job.products.length(),120))continue
                    if(Thread.currentThread().isInterrupted)throw InterruptedException()
                    val title=job.products.getJSONObject(job.examined).optString("title");job.examined++
                    val decision=answer(job.wanted.getString("name").take(160),title.take(160))
                    if(yes(decision) && job.seen.add(title))job.matched.put(title)
                }
            }
            for(job in jobs)output.put(JSONObject().put("id",job.wanted.getString("id")).put("titles",job.matched).put("examined",job.examined).put("available",job.products.length()))
        } finally { engine.close() }
        return JSONObject().put("items",output).toString()
    }
}
