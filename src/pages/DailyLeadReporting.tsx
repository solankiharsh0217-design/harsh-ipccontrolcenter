import { useSearchParams } from "react-router-dom";
import DailyLeadReportingModule from "@/components/roas/DailyLeadReportingModule";
import { styles } from "@/pages/RoasCalculator";

export default function DailyLeadReporting() {
  const [params] = useSearchParams();
  const editReportId = params.get("editReportId");
  return (
    <div className="rcv2 rcv2-wide">
      <style>{styles}</style>
      <style>{`
        .rcv2.rcv2-wide .content{max-width:none;padding:32px 28px}
      `}</style>
      <div className="content">
        <DailyLeadReportingModule initialEditReportId={editReportId} />
      </div>
    </div>
  );
}
