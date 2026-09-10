import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Palmtree, 
  Stethoscope, 
  Star, 
  FileText, 
  Briefcase, 
  Baby,
  Calendar,
  Clock,
  TrendingUp,
  AlertCircle,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const UserPTOBalance = base44.entities.UserPTOBalance;
const PTOPolicy = base44.entities.PTOPolicy;
const TimeOffRequest = base44.entities.TimeOffRequest;

const TYPE_ICONS = {
  vacation: Palmtree,
  sick: Stethoscope,
  personal: Star,
  bereavement: FileText,
  jury_duty: Briefcase,
  parental: Baby
};

export default function PTOBalanceView({ currentUser }) {
  const [balance, setBalance] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [upcomingRequests, setUpcomingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.email) {
      loadBalanceData();
    }
  }, [currentUser]);

  const loadBalanceData = async () => {
    setIsLoading(true);
    try {
      const [balanceData, requests] = await Promise.all([
        loadAllEntityRows({
          entity: UserPTOBalance,
          query: { user_email: currentUser.email },
          sort: null,
          label: `PTO balance for ${currentUser.email}`,
        }),
        loadAllEntityRows({
          entity: TimeOffRequest,
          query: {
            user_email: currentUser.email,
            status: { $in: ["pending", "approved"] }
          },
          sort: null,
          label: `Upcoming time off for ${currentUser.email}`,
        })
      ]);

      if (balanceData.length > 1) {
        throw new Error(`Multiple PTO balance records were found for ${currentUser.email}. An administrator must review the duplicates before balances can be shown safely.`);
      }
      
      if (balanceData.length === 1) {
        const userBalance = balanceData[0];
        setBalance(userBalance);
        
        // Load policy
        const policyData = await PTOPolicy.filter({ id: userBalance.policy_id });
        if (policyData.length > 0) {
          setPolicy(policyData[0]);
        }
      }
      
      setUpcomingRequests(requests.sort((a, b) => 
        new Date(a.start_date) - new Date(b.start_date)
      ));
    } catch (err) {
      console.error("Error loading PTO balance:", err);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="clay-card p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="clay-card p-6 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-600">No PTO policy assigned</p>
        <p className="text-sm text-gray-400 mt-1">Contact your administrator to set up your time off benefits</p>
      </div>
    );
  }

  const getIcon = (typeId) => {
    const iconKey = typeId.toLowerCase().replace(/_/g, "");
    const IconComponent = TYPE_ICONS[iconKey] || Clock;
    return IconComponent;
  };

  const getPolicyType = (typeId) => {
    return policy?.time_off_types?.find(t => t.id === typeId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="clay-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Your Time Off Benefits</h3>
            <p className="text-sm text-gray-500">Policy: {policy?.name || "Unknown"}</p>
          </div>
          {balance.floating_holidays_remaining > 0 && (
            <Badge className="bg-amber-100 text-amber-700 gap-1">
              <Star className="w-3 h-3" />
              {balance.floating_holidays_remaining} Floating Holidays
            </Badge>
          )}
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(balance.balances || []).map(typeBalance => {
          const policyType = getPolicyType(typeBalance.type_id);
          const Icon = getIcon(typeBalance.type_id);
          const totalCapacity = policyType?.accrual_cap || typeBalance.available_hours;
          const percentUsed = totalCapacity > 0 
            ? ((typeBalance.used_hours / totalCapacity) * 100) 
            : 0;
          
          return (
            <div 
              key={typeBalance.type_id} 
              className="clay-card p-4"
              style={{ borderLeft: `4px solid ${policyType?.color || '#6B7280'}` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: (policyType?.color || '#6B7280') + '20' }}
                >
                  <Icon className="w-5 h-5" style={{ color: policyType?.color || '#6B7280' }} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">{typeBalance.type_name}</h4>
                  <p className="text-xs text-gray-500">
                    {policyType?.accrual_type !== 'none' && (
                      <span>Accrues {policyType?.accrual_rate}h {policyType?.accrual_type?.replace('_', ' ')}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-bold" style={{ color: policyType?.color || '#6B7280' }}>
                    {typeBalance.available_hours}h
                  </span>
                  <span className="text-sm text-gray-500">available</span>
                </div>
                
                {totalCapacity > 0 && (
                  <Progress 
                    value={100 - percentUsed} 
                    className="h-2"
                  />
                )}

                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mt-3 pt-3 border-t">
                  <div>
                    <p className="text-gray-400">Used YTD</p>
                    <p className="font-medium">{typeBalance.used_hours}h</p>
                  </div>
                  {typeBalance.pending_hours > 0 && (
                    <div>
                      <p className="text-gray-400">Pending</p>
                      <p className="font-medium text-yellow-600">{typeBalance.pending_hours}h</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400">Accrued YTD</p>
                    <p className="font-medium text-green-600">{typeBalance.accrued_ytd}h</p>
                  </div>
                  {typeBalance.carryover_hours > 0 && (
                    <div>
                      <p className="text-gray-400">Carryover</p>
                      <p className="font-medium text-blue-600">{typeBalance.carryover_hours}h</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming Time Off */}
      {upcomingRequests.length > 0 && (
        <div className="clay-card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            Upcoming Time Off
          </h3>
          <div className="space-y-2">
            {upcomingRequests.slice(0, 5).map(request => (
              <div key={request.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <p className="text-sm font-medium capitalize">
                    {request.request_type.replace("_", " ")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(request.start_date), "MMM d")}
                    {request.end_date !== request.start_date && 
                      ` - ${format(new Date(request.end_date), "MMM d")}`
                    }
                  </p>
                </div>
                <Badge className={
                  request.status === "approved" 
                    ? "bg-green-100 text-green-700" 
                    : "bg-yellow-100 text-yellow-700"
                }>
                  {request.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Policy Summary */}
      {policy && (
        <div className="clay-card p-4">
          <h3 className="font-semibold mb-3">Policy Details</h3>
          <div className="space-y-2 text-sm">
            {policy.holidays && policy.holidays.length > 0 && (
              <div>
                <p className="text-gray-500">Company Holidays: <strong>{policy.holidays.length} days</strong></p>
              </div>
            )}
            {balance.hire_date && (
              <div>
                <p className="text-gray-500">Hire Date: <strong>{format(new Date(balance.hire_date), "MMM d, yyyy")}</strong></p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}