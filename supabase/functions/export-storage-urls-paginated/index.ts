import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { bucket_ids } = await req.json()
    const allUrls = []

    for (const bucketId of bucket_ids) {
      console.log(`Processing bucket: ${bucketId}`)
      
      let hasMore = true
      let offset = 0
      const limit = 100

      while (hasMore) {
        const { data: objects, error } = await supabaseClient
          .storage
          .from(bucketId)
          .list('', {
            limit,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          })

        if (error) {
          console.error(`Error listing objects in ${bucketId}:`, error)
          break
        }

        if (!objects || objects.length === 0) {
          hasMore = false
          break
        }

        for (const obj of objects) {
          // Skip folders (they usually have metadata but no size/type)
          if (!obj.id) continue 

          const { data, error: urlError } = await supabaseClient
            .storage
            .from(bucketId)
            .createSignedUrl(obj.name, 604800) // 7 days

          if (urlError) {
            console.error(`Error signing ${obj.name}:`, urlError)
            continue
          }

          allUrls.push({
            bucket_id: bucketId,
            object_name: obj.name,
            size_bytes: obj.metadata?.size || 0,
            signed_url: data.signedUrl
          })
        }

        offset += limit
        if (objects.length < limit) hasMore = false
      }
    }

    // Return as CSV content string
    let csvContent = "bucket_id,object_name,size_bytes,signed_url\\n"
    allUrls.forEach(item => {
      const name = item.object_name.includes(',') ? `"${item.object_name}"` : item.object_name
      csvContent += `${item.bucket_id},${name},${item.size_bytes},${item.signed_url}\\n`
    })

    return new Response(csvContent, {
      headers: { ...corsHeaders, 'Content-Type': 'text/csv' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
