
import { format, differenceInDays, addDays, startOfWeek } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const stageColors = {
  estimating: "#FFF9C4",
  sales: "#B2DFDB",
  permitting: "#FFE4D6",
  design: "#D4E9F7", 
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7"
};

const stageNames = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation"
};

export default function GanttChart({ workOrders }) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weeks = 8;
  const daysToShow = weeks * 7;

  const dateHeaders = [];
  for (let i = 0; i < weeks; i++) {
    const weekDate = addDays(weekStart, i * 7);
    dateHeaders.push(weekDate);
  }

  const getBarPosition = (startDate, dueDate) => {
    if (!startDate || !dueDate) return { left: 0, width: 0 };
    
    const start = new Date(startDate);
    const end = new Date(dueDate);
    const daysFromStart = differenceInDays(start, weekStart);
    const duration = differenceInDays(end, start);
    
    // Calculate left position based on days from week start
    // If the bar starts before the visible week, clamp left to 0
    const left = (daysFromStart / daysToShow) * 100;
    
    // Calculate width based on duration
    const width = (duration / daysToShow) * 100;
    
    return { left: `${Math.max(0, left)}%`, width: `${Math.max(2, width)}%` }; // Ensure min width of 2% for visibility
  };

  const getPageNameForStage = (stage) => {
    const stagePageMap = {
      'estimating': 'Estimating',
      'sales': 'Sales',
      'permitting': 'Permitting',
      'design': 'Design',
      'production': 'Production',
      'fabrication': 'Fabrication',
      'installation': 'InstallationDeliver'
    };
    return stagePageMap[stage] || 'Estimating';
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1200px]">
        {/* Header */}
        <div className="flex border-b-2 border-gray-200 pb-2 mb-4">
          <div className="w-64 font-bold text-gray-700 pr-4">Work Order</div>
          <div className="flex-1 flex">
            {dateHeaders.map((date, i) => (
              <div key={i} className="flex-1 text-center text-xs">
                <div className="font-semibold text-gray-700">
                  Week {i + 1}
                </div>
                <div className="text-gray-500">
                  {format(date, "MMM d")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gantt Rows */}
        {workOrders.map((wo) => (
          <div key={wo.id} className="mb-3">
            <div className="flex items-center mb-1">
              <div className="w-64 pr-4">
                <Link to={createPageUrl(getPageNameForStage(wo.current_stage))}>
                  <div className="clay-card p-3 cursor-pointer hover:opacity-80 transition-opacity">
                    <div className="font-semibold text-sm text-gray-800 truncate">
                      {wo.title}
                    </div>
                    <div className="text-xs text-gray-600 truncate">{wo.client_name}</div>
                    {wo.riders && wo.riders.length > 0 && (
                      <div className="text-xs text-purple-600 font-medium mt-1">
                        {wo.riders.length} Rider{wo.riders.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </Link>
              </div>
              <div className="flex-1 relative" style={{ height: wo.riders && wo.riders.length > 0 ? `${(wo.riders.length + 1) * 48}px` : '64px' }}>
                <div className="absolute inset-0 flex flex-col gap-2">
                  {/* Parent work order bar */}
                  <div className="relative h-10 flex items-center">
                    <div className="w-full h-1 bg-gray-200 rounded-full" />
                    {wo.start_date && wo.due_date && (
                      <Link 
                        to={createPageUrl(getPageNameForStage(wo.current_stage))}
                        className="absolute h-10 rounded-2xl flex items-center justify-center transition-all duration-300 hover:opacity-80"
                        style={{
                          ...getBarPosition(wo.start_date, wo.due_date),
                          background: `linear-gradient(135deg, ${stageColors[wo.current_stage]}ee 0%, ${stageColors[wo.current_stage]}aa 100%)`,
                          boxShadow: '3px 3px 8px rgba(0,0,0,0.1), -1px -1px 4px rgba(255,255,255,0.7), inset 1px 1px 3px rgba(255,255,255,0.5)'
                        }}
                      >
                        <span className="text-xs font-medium text-gray-700 px-2">
                          {stageNames[wo.current_stage]}
                        </span>
                      </Link>
                    )}
                  </div>
                  
                  {/* Rider bars */}
                  {wo.riders && wo.riders.map((rider, index) => (
                    <div key={rider.id} className="relative h-10 flex items-center pl-6">
                      <div className="w-full h-1 bg-gray-200 rounded-full" />
                      {rider.start_date && rider.due_date && (
                        <Link
                          to={createPageUrl(getPageNameForStage(rider.rider_stage || rider.current_stage))}
                          className="absolute h-8 rounded-xl flex items-center justify-center transition-all duration-300 hover:opacity-80"
                          style={{
                            ...getBarPosition(rider.start_date, rider.due_date),
                            background: `linear-gradient(135deg, ${stageColors[rider.rider_stage || rider.current_stage]}dd 0%, ${stageColors[rider.rider_stage || rider.current_stage]}88 100%)`,
                            boxShadow: '2px 2px 6px rgba(0,0,0,0.1), -1px -1px 3px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.4)',
                            border: '2px dashed rgba(124, 58, 237, 0.3)'
                          }}
                        >
                          <span className="text-[10px] font-medium text-gray-700 px-2">
                            {stageNames[rider.rider_stage || rider.current_stage]}
                          </span>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
