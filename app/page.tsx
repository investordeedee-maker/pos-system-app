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
      <div className="w-full max-w-5xl space-y-8">
        
        {/* Header */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 mb-1">ยินดีต้อนรับสู่ระบบ</p>
            <h1 className="text-3xl font-black text-gray-800">{storeName}</h1>
          </div>
          <button onClick={handleLogout} className="cursor-pointer px-5 py-2.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button onClick={() => router.push("/pos")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 transition-all text-left group">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🛒</div>
            <div><h2 className="text-lg font-black text-gray-800">ระบบขายหน้าร้าน</h2><p className="text-xs text-gray-500 mt-1">หน้าจอคิดเงินและออกใบเสร็จ</p></div>
          </button>

          <button onClick={() => router.push("/dashboard")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-300 transition-all text-left group">
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📊</div>
            <div><h2 className="text-lg font-black text-gray-800">แดชบอร์ด & ยืนยันสลิป</h2><p className="text-xs text-gray-500 mt-1">ดูรายงานการขาย ตรวจสลิป</p></div>
          </button>

          <button onClick={() => router.push("/inventory")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-300 transition-all text-left group">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📋</div>
            <div><h2 className="text-lg font-black text-gray-800">คุมสต๊อก & Stock Card</h2><p className="text-xs text-gray-500 mt-1">รับเข้าสินค้าและดูความเคลื่อนไหว</p></div>
          </button>

          <button onClick={() => router.push("/products")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-yellow-300 transition-all text-left group">
            <div className="w-14 h-14 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📦</div>
            <div><h2 className="text-lg font-black text-gray-800">จัดการคลังสินค้า</h2><p className="text-xs text-gray-500 mt-1">เพิ่ม/ลบ และแก้ไขราคาสินค้า</p></div>
          </button>

          <button onClick={() => router.push("/store")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-green-300 transition-all text-left group">
            <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🌐</div>
            <div><h2 className="text-lg font-black text-gray-800">หน้าร้านออนไลน์</h2><p className="text-xs text-gray-500 mt-1">สำหรับให้ลูกค้าสั่งซื้อและแนบสลิป</p></div>
          </button>

          <button onClick={() => router.push("/settings")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-300 transition-all text-left group">
            <div className="w-14 h-14 bg-gray-50 text-gray-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">⚙️</div>
            <div><h2 className="text-lg font-black text-gray-800">ตั้งค่าระบบ (Settings)</h2><p className="text-xs text-gray-500 mt-1">ตั้งค่าพร้อมเพย์และหัวใบเสร็จ</p></div>
          </button>

          <button onClick={() => router.push("/setup-store")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-teal-300 transition-all text-left group">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🏪</div>
            <div><h2 className="text-lg font-black text-gray-800">ข้อมูลโปรไฟล์ร้าน</h2><p className="text-xs text-gray-500 mt-1">จัดการชื่อร้าน โลโก้ ที่อยู่</p></div>
          </button>

          <button onClick={() => window.open("/kitchen", "_blank")} className="cursor-pointer flex items-center p-6 bg-gray-900 rounded-3xl shadow-sm border border-gray-700 hover:shadow-lg hover:border-orange-500 transition-all text-left group">
            <div className="w-14 h-14 bg-gray-800 text-orange-500 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">👨‍🍳</div>
            <div><h2 className="text-lg font-black text-white">จอห้องครัว (KDS)</h2><p className="text-xs text-gray-400 mt-1">คิวทำอาหารสำหรับพ่อครัว</p></div>
          </button>

          <button onClick={() => window.open("/customer-display", "_blank")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-pink-300 transition-all text-left group">
            <div className="w-14 h-14 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🖥️</div>
            <div><h2 className="text-lg font-black text-gray-800">จอฝั่งลูกค้า</h2><p className="text-xs text-gray-500 mt-1">แสดงยอดเงินและ QR สแกนจ่าย</p></div>
          </button>
        
          <button onClick={() => window.open("/kiosk", "_blank")} className="cursor-pointer flex items-center p-6 bg-blue-50 rounded-3xl shadow-sm border border-blue-200 hover:shadow-lg hover:border-blue-400 transition-all text-left group">
            <div className="w-14 h-14 bg-white text-blue-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0 border border-blue-100">🤖</div>
            <div><h2 className="text-lg font-black text-blue-900">เปิดตู้ Kiosk (สั่งเอง)</h2><p className="text-xs text-blue-700 mt-1">ตู้บริการสั่งและสแกนจ่ายอัตโนมัติ</p></div>
          </button>
          
          <button onClick={() => router.push('/orders')} className="cursor-pointer flex items-center p-6 bg-blue-600 rounded-3xl shadow-sm border border-blue-700 hover:shadow-lg hover:bg-blue-700 transition-all text-left group">
            <div className="w-14 h-14 bg-white/20 text-white rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📦</div>
            <div><h2 className="text-lg font-black text-white">จัดการคำสั่งซื้อ</h2><p className="text-xs text-blue-100 mt-1">อัปเดตสถานะและแชทกับลูกค้า</p></div>
          </button>
        </div>
        
     </div>
    </div>
 );
}