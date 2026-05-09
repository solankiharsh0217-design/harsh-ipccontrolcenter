import { useSearchParams } from "react-router-dom";
import DailyLeadReportingModule from "@/components/roas/DailyLeadReportingModule";
import { styles } from "@/pages/RoasCalculator";

export default function DailyLeadReporting() {
  const [params] = useSearchParams();
  const editReportId = params.get("editReportId");
  return (
    <div className="rcv2">
      <style>{styles}</style>
      <div className="content">
        <DailyLeadReportingModule initialEditReportId={editReportId} />
      </div>
    </div>
  );
}
