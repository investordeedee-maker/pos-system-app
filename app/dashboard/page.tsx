"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Order {
  id: string;
  store_id: string;
  doc_no: string;
  created_at: string;
  total_amount: number;
  status: string;
  payment_method: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState({ today: 0, month: 0, pending: 0, completedBills: 0 });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchDashboard = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (!profile?.store_id) return;

        const { data: orders } = await supabase.from("orders").select("*").eq("store_id", profile.store_id).order("created_at", { ascending: false });
        if (orders) {
          const now = new Date();
          let todayTotal = 0; let monthTotal = 0; let pendingTotal = 0; let compBills = 0;
          
          orders.forEach((o: Order) => {
            const orderDate = new Date(o.created_at);
            if (o.status === "completed") {
              if (orderDate.toDateString() === now.toDateString()) todayTotal += o.total_amount;
              if (orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear()) {
                monthTotal += o.total_amount; compBills++;
              }
            } else if (o.status === "pending") pendingTotal += o.total_amount;
          });
          if(isMounted) { setSalesData({ today: todayTotal, month: monthTotal, pending: pendingTotal, completedBills: compBills }); setRecentOrders(orders.slice(0, 10)); }
        }
      } catch { } finally { if (isMounted) setLoading(false); }
    };
    fetchDashboard();
    return () => { isMounted = false; };
  }, [router]);

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold">กำลังโหลดสรุปยอดขาย...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📊 แดชบอร์ดสรุปยอดขาย</h1>
          <button onClick={() => router.push("/")} className="px-4 py-2 bg-gray-100 font-bold rounded-xl hover:bg-gray-200 transition-all">🏠 กลับหน้าหลัก</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-green-500">
            <p className="text-gray-500 font-bold">ยอดขายวันนี้ (สำเร็จ)</p>
            <p className="text-4xl font-black text-green-600 mt-2">฿{salesData.today.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-blue-500">
            <p className="text-gray-500 font-bold">ยอดขายเดือนนี้ (สำเร็จ)</p>
            <p className="text-4xl font-black text-blue-600 mt-2">฿{salesData.month.toLocaleString()}</p>
            <p className="text-sm text-gray-400 mt-1">{salesData.completedBills} บิลที่ชำระแล้ว</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-orange-500">
            <p className="text-gray-500 font-bold">ยอดค้างชำระทั้งหมด</p>
            <p className="text-4xl font-black text-orange-600 mt-2">฿{salesData.pending.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-800 text-white font-bold">บิลล่าสุด</div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="p-4">เลขที่บิล</th><th className="p-4">วันที่/เวลา</th><th className="p-4">ยอดสุทธิ</th><th className="p-4">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-bold">{order.doc_no}</td>
                  <td className="p-4 text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')}</td>
                  <td className="p-4 font-bold text-blue-600">฿{order.total_amount.toLocaleString()}</td>
                  <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{order.status === 'completed' ? 'ชำระแล้ว' : 'ค้างชำระ'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}