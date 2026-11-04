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
    private val digest = "c4a9b7289365ab80fe599b844b77ad253eb3c53fb0e5d963d699146a6f01255e"
    private val modelUrl = "https://huggingface.co/litert-community/Qwen2.5-1.5B-Instruct/resolve/5e6e7a58d03777898b31330a15d2e0a5a9107de3/Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm"
    private val file = File(context.filesDir, "qwen2.5-1.5b-int8.litertlm")

    private fun hash(file: File): String {
        val md=MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input -> val b=ByteArray(65536); while(true) { if(Thread.currentThread().isInterrupted)throw InterruptedException();val n=input.read(b); if(n<0) break; md.update(b,0,n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
    private fun prepare() = synchronized(modelLock) {
        if(file.exists() && hash(file)==digest)return
        if(context.filesDir.usableSpace<1900000000L)throw IllegalStateException("Not enough space for offline model")
        val temp=File(context.filesDir,"offline-model.download")
        temp.delete()
        try {
            val conn=URL(modelUrl).openConnection() as HttpURLConnection
            conn.connectTimeout=20000;conn.readTimeout=30000;conn.instanceFollowRedirects=true
            try {
                if(conn.responseCode !in 200..299 || conn.url.protocol!="https") throw IllegalStateException("Model download unavailable")
                var total=0L
                conn.inputStream.buffered().use { input -> temp.outputStream().buffered().use { out ->
                    val b=ByteArray(65536);while(true) { if(Thread.currentThread().isInterrupted)throw InterruptedException();val n=input.read(b);if(n<0)break;total+=n;if(total>1900000000L)throw IllegalStateException("Model too large");out.write(b,0,n) }
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
        if(memory.availMem<2800000000L) throw IllegalStateException("Not enough free memory for offline AI")
        prepare()
        val output=JSONArray()
        val engine=Engine(EngineConfig(modelPath=file.absolutePath,backend=Backend.CPU(),maxNumTokens=1024))
        engine.initialize()
        fun answer(request: String,title: String): String {
            val prompt="محصول مورد نیاز: "+request+". گزینه: "+title+". آیا گزینه همان محصول مورد نیاز است؟ فقط بله یا خیر."
            val config=ConversationConfig(samplerConfig=SamplerConfig(topK=1,topP=1.0,temperature=0.0))
            return engine.createConversation(config).use { it.sendMessage(prompt).toString() }
                .replace(Regex("<think>.*?</think>",RegexOption.DOT_MATCHES_ALL),"").trim()
        }
        fun yes(s: String)=s.matches(Regex("(?:بله|آری)[.!؟]?"))
        fun no(s: String)=s.matches(Regex("(?:خیر|نه)[.!؟]?"))
        val deadline=System.nanoTime()+90000000000L
        try {
            if(!yes(answer("شیر کم چرب","شیر کم چرب یک لیتر")) || !no(answer("شیر کم چرب","مایع ظرفشویی")) || !no(answer("شیر کم چرب","شیر کاکائو")))
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
