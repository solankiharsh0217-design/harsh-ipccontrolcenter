import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: buckets, error: bError } = await supabase.storage.listBuckets()
  if (bError) return new Response(JSON.stringify(bError), { status: 500 })

  const results = []

  for (const bucket of buckets) {
    // Basic recursive list (manual depth since list() isn't deeply recursive in one call)
    const listObjects = async (path = '') => {
      const { data: objects, error } = await supabase.storage.from(bucket.id).list(path)
      if (error) return

      for (const obj of objects) {
        const fullPath = path ? `${path}/${obj.name}` : obj.name
        if (!obj.id) { // It's a folder-like structure
          await listObjects(fullPath)
        } else {
          const { data, error: urlError } = await supabase.storage
            .from(bucket.id)
            .createSignedUrl(fullPath, 604800)
          
          results.push({
            bucket_id: bucket.id,
            object_name: fullPath,
            size_bytes: obj.metadata?.size || 0,
            signed_url: data?.signedUrl || ''
          })
        }
      }
    }
    await listObjects()
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
})
