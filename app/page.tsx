"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("POS System");
  
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [onlinePendingCount, setOnlinePendingCount] = useState(0);
  const [storePendingCount, setStorePendingCount] = useState(0);
  const [kitchenCount, setKitchenCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0); // นับจำนวนข้อความใหม่ที่ยังไม่อ่าน

  useEffect(() => {
    let isMounted = true;
    let storeIdStr = "";

    const fetchStats = async (currentStoreId: string) => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data: todayOrders } = await supabase
        .from("orders")
        .select("total_amount")
        .eq("store_id", currentStoreId)
        .eq("status", "completed")
        .gte("created_at", today);
      
      if (todayOrders && isMounted) {
        setTodayRevenue(todayOrders.reduce((sum, o) => sum + o.total_amount, 0));
      }

      const { data: activeOrders } = await supabase
        .from("orders")
        .select("status, order_source, kitchen_status")
        .eq("store_id", currentStoreId)
        .or("status.in.(pending,processing),kitchen_status.eq.pending");
      
      if (activeOrders && isMounted) {
        setOnlinePendingCount(activeOrders.filter(o => o.status === "pending" && o.order_source === "ONLINE").length);
        setStorePendingCount(activeOrders.filter(o => o.status === "pending" && o.order_source !== "ONLINE").length);
        setKitchenCount(activeOrders.filter(o => 
          o.kitchen_status === "pending" && 
          !(o.status === "pending" && o.order_source === "ONLINE")
        ).length);
      }

      // ดึงข้อความแชทลูกค้าทั้งหมดเพื่อคำนวณ Unread
      const { data: recentChats } = await supabase
        .from("order_messages")
        .select("order_id, created_at, sender_type")
        .eq("sender_type", "CUSTOMER");
      
      if (recentChats && isMounted) {
        const readMap = JSON.parse(localStorage.getItem('store_read_timestamps') || '{}');
        // กรองเฉพาะข้อความที่เวลายังใหม่กว่าเวลาที่เรากดเปิดอ่านล่าสุด
        const unreadCount = recentChats.filter(m => 
            !readMap[m.order_id] || new Date(m.created_at) > new Date(readMap[m.order_id])
        ).length;
        setUnreadChatCount(unreadCount);
      }
    };

    const checkAuthAndFetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (profile?.store_id) {
          storeIdStr = profile.store_id;
          const { data: storeData } = await supabase.from("stores").select("name").eq("id", profile.store_id).single();
          if (storeData && isMounted) setStoreName(storeData.name);

          await fetchStats(profile.store_id);
        }
      } catch (e) { console.error(e); } finally { if (isMounted) setLoading(false); }
    };

    checkAuthAndFetchData();

    const orderChannel = supabase.channel('home_orders_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (storeIdStr) fetchStats(storeIdStr);
      }).subscribe();
      
    const chatChannel = supabase.channel('home_chats_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages' }, () => {
        if (storeIdStr) fetchStats(storeIdStr);
      }).subscribe();

    return () => { 
      isMounted = false; 
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดระบบ...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-7xl space-y-8">
        
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 mb-1">ยินดีต้อนรับสู่ระบบ</p>
            <h1 className="text-3xl font-black text-gray-800">{storeName}</h1>
          </div>
          <button onClick={handleLogout} className="cursor-pointer px-5 py-2.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors">
            ออกจากระบบ
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-3xl text-white shadow-lg">
            <p className="text-sm font-medium text-blue-100 mb-1">ยอดขายสำเร็จ (วันนี้)</p>
            <p className="text-3xl lg:text-4xl font-black">฿{todayRevenue.toLocaleString()}</p>
          </div>
          
          <div onClick={() => router.push("/dashboard?tab=online")} className={`cursor-pointer p-6 rounded-3xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${onlinePendingCount > 0 ? "bg-gradient-to-br from-orange-500 to-red-500 animate-pulse" : "bg-gradient-to-br from-gray-400 to-gray-500"}`}>
            <p className="text-sm font-medium text-orange-100 mb-1">ออนไลน์รอยืนยันสลิป</p>
            <p className="text-3xl lg:text-4xl font-black">{onlinePendingCount} <span className="text-lg font-normal">รายการ</span></p>
          </div>
          
          <div onClick={() => router.push("/dashboard?tab=store")} className={`cursor-pointer p-6 rounded-3xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${storePendingCount > 0 ? "bg-gradient-to-br from-yellow-500 to-orange-500" : "bg-gradient-to-br from-gray-400 to-gray-500"}`}>
            <p className="text-sm font-medium text-yellow-100 mb-1">หน้าร้านรอชำระเงิน</p>
            <p className="text-3xl lg:text-4xl font-black">{storePendingCount} <span className="text-lg font-normal">รายการ</span></p>
          </div>

          <div onClick={() => window.open("/kitchen", "_blank")} className={`cursor-pointer p-6 rounded-3xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${kitchenCount > 0 ? "bg-gradient-to-br from-purple-500 to-indigo-500" : "bg-gradient-to-br from-gray-400 to-gray-500"}`}>
            <p className="text-sm font-medium text-purple-100 mb-1">ค้างทำในห้องครัว</p>
            <p className="text-3xl lg:text-4xl font-black">{kitchenCount} <span className="text-lg font-normal">รายการ</span></p>
          </div>

          <div onClick={() => router.push("/orders")} className={`cursor-pointer p-6 rounded-3xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${unreadChatCount > 0 ? "bg-gradient-to-br from-pink-500 to-rose-500 animate-pulse" : "bg-gradient-to-br from-gray-400 to-gray-500"}`}>
            <p className="text-sm font-medium text-pink-100 mb-1">ข้อความใหม่ (แชท)</p>
            <p className="text-3xl lg:text-4xl font-black">{unreadChatCount} <span className="text-lg font-normal">ข้อความ</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button onClick={() => router.push("/pos")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 transition-all text-left group">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🛒</div>
            <div><h2 className="text-lg font-black text-gray-800">ขายหน้าร้าน</h2><p className="text-xs text-gray-500 mt-1">หน้าจอคิดเงิน POS</p></div>
          </button>

          <button onClick={() => router.push("/dashboard")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-300 transition-all text-left group">
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📊</div>
            <div><h2 className="text-lg font-black text-gray-800">แดชบอร์ด</h2><p className="text-xs text-gray-500 mt-1">ตรวจสลิปและรายงาน</p></div>
          </button>

          <button onClick={() => router.push("/inventory")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-300 transition-all text-left group">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📋</div>
            <div><h2 className="text-lg font-black text-gray-800">คุมสต๊อก</h2><p className="text-xs text-gray-500 mt-1">Stock Card รับเข้า</p></div>
          </button>

          <button onClick={() => router.push("/products")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-yellow-300 transition-all text-left group">
            <div className="w-14 h-14 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">📦</div>
            <div><h2 className="text-lg font-black text-gray-800">คลังสินค้า</h2><p className="text-xs text-gray-500 mt-1">เพิ่ม/ลบ แก้ไขราคา</p></div>
          </button>

          <button onClick={() => router.push("/store")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-green-300 transition-all text-left group">
            <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🌐</div>
            <div><h2 className="text-lg font-black text-gray-800">ร้านออนไลน์</h2><p className="text-xs text-gray-500 mt-1">ลูกค้าสั่งซื้อ/แนบสลิป</p></div>
          </button>

          <button onClick={() => window.open("/kiosk", "_blank")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-teal-300 transition-all text-left group">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🤖</div>
            <div><h2 className="text-lg font-black text-gray-800">ตู้ Kiosk</h2><p className="text-xs text-gray-500 mt-1">ลูกค้ากดสั่งเอง</p></div>
          </button>

          <button onClick={() => window.open("/customer-display", "_blank")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-pink-300 transition-all text-left group">
            <div className="w-14 h-14 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🖥️</div>
            <div><h2 className="text-lg font-black text-gray-800">จอฝั่งลูกค้า</h2><p className="text-xs text-gray-500 mt-1">แสดงยอดและ QR</p></div>
          </button>

          <button onClick={() => window.open("/kitchen", "_blank")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-400 transition-all text-left group">
            <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">👨‍🍳</div>
            <div><h2 className="text-lg font-black text-gray-800">จอห้องครัว</h2><p className="text-xs text-gray-500 mt-1">คิวทำอาหาร (KDS)</p></div>
          </button>

          <button onClick={() => router.push('/orders')} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-400 transition-all text-left group">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">💬</div>
            <div><h2 className="text-lg font-black text-gray-800">แชท & ติดตาม</h2><p className="text-xs text-gray-500 mt-1">แชทคุยกับลูกค้าออนไลน์</p></div>
          </button>
          
          <button onClick={() => router.push("/setup-store")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-cyan-300 transition-all text-left group">
            <div className="w-14 h-14 bg-cyan-50 text-cyan-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">🏪</div>
            <div><h2 className="text-lg font-black text-gray-800">ข้อมูลร้าน</h2><p className="text-xs text-gray-500 mt-1">จัดการชื่อ/โลโก้</p></div>
          </button>

          <button onClick={() => router.push("/settings")} className="cursor-pointer flex items-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-400 transition-all text-left group">
            <div className="w-14 h-14 bg-gray-50 text-gray-600 rounded-2xl flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0">⚙️</div>
            <div><h2 className="text-lg font-black text-gray-800">ตั้งค่าระบบ</h2><p className="text-xs text-gray-500 mt-1">พร้อมเพย์/ใบเสร็จ</p></div>
          </button>
        </div>
        
     </div>
    </div>
 );
}