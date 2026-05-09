import DailyLeadReportingModule from "@/components/roas/DailyLeadReportingModule";
import { styles } from "@/pages/RoasCalculator";

export default function DailyLeadReporting() {
  return (
    <div className="rcv2">
      <style>{styles}</style>
      <div className="content">
        <DailyLeadReportingModule />
      </div>
    </div>
  );
}
