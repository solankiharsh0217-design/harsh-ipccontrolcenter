import { useEffect, useState } from "react";
import { PageHead, Tag, EmptyState } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { formatDateShort } from "@/lib/format";

export default function Announcements() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("announcements").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, []);
  return (
    <div className="max-w-[720px]">
      <PageHead title="Announcements" sub="Internal notices for the IPC team." back />
      <div className="border border-line rounded-xl bg-white overflow-hidden">
        {items.length === 0 && <EmptyState title="No announcements yet." />}
        {items.map(a => (
          <div key={a.id} className="px-[22px] py-4 border-b border-line last:border-b-0 hover:bg-off transition-colors">
            <div className="mb-2"><Tag type={a.tag_type}>{a.tag_type}</Tag></div>
            <div className="font-serif text-lg font-medium text-black mb-1.5">{a.title}</div>
            <div className="font-sans text-xs font-light text-muted-foreground leading-[1.65]">{a.body}</div>
            <div className="font-sans text-[10px] text-[hsl(var(--muted-light))] mt-1.5">{formatDateShort(a.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
