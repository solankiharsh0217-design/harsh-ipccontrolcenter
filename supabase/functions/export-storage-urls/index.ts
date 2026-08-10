import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: buckets, error: bError } = await supabase.storage.listBuckets()
  if (bError) return new Response(JSON.stringify({ error: bError }), { status: 500 })

  const results = []

  for (const bucket of buckets) {
    const listAllObjects = async (path = '') => {
      let { data: objects, error } = await supabase.storage.from(bucket.id).list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      })
      
      if (error) return

      for (const obj of objects) {
        const fullPath = path ? `${path}/${obj.name}` : obj.name
        // Check if it's a "folder" (no id in metadata usually indicates a folder in the list response)
        if (!obj.id && !obj.metadata) { 
          await listAllObjects(fullPath)
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
    await listAllObjects()
  }

  return new Response(JSON.stringify(results), { 
    headers: { 'Content-Type': 'application/json' } 
  })
})
