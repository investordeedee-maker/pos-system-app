"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("POS System");
  const [pendingCount, setPendingCount] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const checkAuthAndFetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (profile?.store_id) {
          const { data: storeData } = await supabase.from("stores").select("name").eq("id", profile.store_id).single();
          if (storeData) setStoreName(storeData.name);

          // ดึงสถิติรายวันมาโชว์หน้าแรก
          const today = new Date().toISOString().split("T")[0];
          const { data: orders } = await supabase.from("orders").select("status, total_amount, created_at").eq("store_id", profile.store_id).gte("created_at", today);
          
          if (orders) {
            setPendingCount(orders.filter(o => o.status === "pending").length);
            setTodayRevenue(orders.filter(o => o.status === "completed").reduce((sum, o) => sum + o.total_amount, 0));
          }
        }
      } catch (e) { console.error(e); } finally { if (isMounted) setLoading(false); }
    };
    checkAuthAndFetchData();
    return () => { isMounted = false; };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">กำลังโหลดระบบ...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 mb-1">ยินดีต้อนรับสู่ระบบ</p>
            <h1 className="text-3xl font-black text-gray-800">{storeName}</h1>
          </div>
          <button onClick={handleLogout} className="px-5 py-2.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors">
            ออกจากระบบ
          </button>
        </div>

        {/* Quick Stats Widget */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-3xl text-white shadow-lg">
            <p className="text-sm font-medium text-blue-100 mb-1">ยอดขายสำเร็จ (วันนี้)</p>
            <p className="text-3xl md:text-4xl font-black">฿{todayRevenue.toLocaleString()}</p>
          </div>
          <div className={`p-6 rounded-3xl text-white shadow-lg ${pendingCount > 0 ? "bg-gradient-to-br from-orange-500 to-red-500 animate-pulse" : "bg-gradient-to-br from-gray-400 to-gray-500"}`}>
            <p className="text-sm font-medium text-orange-100 mb-1">ออเดอร์ใหม่รอยืนยันสลิป</p>
            <p className="text-3xl md:text-4xl font-black">{pendingCount} <span className="text-xl font-normal">รายการ</span></p>
          </div>
        </div>

        {/* Main Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={() => router.push("/pos")} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 transition-all text-left group">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mr-4 group-hover:scale-110 transition-transform">🛒</div>
            <div><h2 className="text-xl font-black text-gray-800">ระบบขายหน้าร้าน (POS)</h2><p className="text-sm text-gray-500 mt-1">หน้าจอคิดเงินและออกใบเสร็จ</p></div>
          </button>

          <button onClick={() => router.push("/dashboard")} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:purple-blue-300 transition-all text-left group">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-3xl mr-4 group-hover:scale-110 transition-transform">📊</div>
            <div><h2 className="text-xl font-black text-gray-800">แดชบอร์ด & ยืนยันสลิป</h2><p className="text-sm text-gray-500 mt-1">ดูรายงานการขาย และตรวจสลิปโอนเงิน</p></div>
          </button>

          <button onClick={() => router.push("/products")} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-yellow-300 transition-all text-left group">
            <div className="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center text-3xl mr-4 group-hover:scale-110 transition-transform">📦</div>
            <div><h2 className="text-xl font-black text-gray-800">จัดการคลังสินค้า</h2><p className="text-sm text-gray-500 mt-1">เพิ่ม/ลบ และแก้ไขราคาสินค้า</p></div>
          </button>

          <button onClick={() => window.open("/store", "_blank")} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-green-300 transition-all text-left group">
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center text-3xl mr-4 group-hover:scale-110 transition-transform">🌐</div>
            <div><h2 className="text-xl font-black text-gray-800">ไปหน้าร้านค้าออนไลน์</h2><p className="text-sm text-gray-500 mt-1">สำหรับให้ลูกค้าสั่งซื้อและแนบสลิป</p></div>
          </button>
        </div>

      </div>
    </div>
  );
}