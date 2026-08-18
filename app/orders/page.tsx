"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface OrderItem {
  product_id: string;
  unit_price: number;
  qty: number;
  remark: string;
  products?: {
    name: string;
  };
}

interface Order {
  id: string;
  doc_no: string;
  created_at: string;
  total_amount: number;
  status: string;
  payment_method: string;
  order_source: string;
  order_items: OrderItem[];
}

export default function OrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    let isMounted = true;
    const fetchOrders = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (isMounted) router.push("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("store_id")
          .eq("id", user.id)
          .single();

        if (profile?.store_id && isMounted) {
          const { data, error } = await supabase
            .from("orders")
            .select(`
              *,
              order_items (*, products (name))
            `)
            .eq("store_id", profile.store_id)
            .order("created_at", { ascending: false });

          if (error) throw error;
          setOrders(data || []);
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error("Error fetching orders:", error.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    return () => { isMounted = false; };
  }, [router]);

  const filteredOrders = orders.filter(order => {
    if (filter === "all") return true;
    return order.status === filter;
  });

  const markAsCompleted = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "completed" })
        .eq("id", orderId);
        
      if (error) throw error;
      
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "completed" } : o));
      alert("✅ อัปเดตสถานะเป็น ชำระเงิน/ส่งของ เรียบร้อยแล้ว");
    } catch (error: unknown) {
      if (error instanceof Error) alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูลคำสั่งซื้อ...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-5 rounded-2xl shadow-sm mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-800">📦 จัดการคำสั่งซื้อ (Order Dashboard)</h1>
            <p className="text-sm text-gray-500 mt-1">ดูรายการสั่งซื้อทั้งหมด และออเดอร์ที่รอไปส่ง</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => router.push("/pos")} className="flex-1 md:flex-none bg-gray-800 hover:bg-gray-900 text-white px-5 py-3 rounded-xl font-bold shadow-md transition-all">
              ← กลับไปหน้า POS
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setFilter("all")} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${filter === "all" ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            ทั้งหมด ({orders.length})
          </button>
          <button onClick={() => setFilter("pending")} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${filter === "pending" ? "bg-orange-500 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            ⏳ รอดำเนินการ/รอเก็บเงิน ({orders.filter(o => o.status === "pending").length})
          </button>
          <button onClick={() => setFilter("completed")} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${filter === "completed" ? "bg-green-600 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            ✅ เสร็จสิ้นแล้ว ({orders.filter(o => o.status === "completed").length})
          </button>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
            <span className="text-4xl">📭</span>
            <h3 className="text-lg font-bold text-gray-700 mt-4">ไม่มีรายการคำสั่งซื้อ</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className={`p-4 flex justify-between items-center border-b ${order.status === 'pending' ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                  <div>
                    <h3 className="font-black text-gray-800">{order.doc_no}</h3>
                    <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${order.status === 'pending' ? 'bg-orange-200 text-orange-800' : 'bg-green-200 text-green-800'}`}>
                    {order.status === 'pending' ? 'รอเก็บเงิน/จัดส่ง' : 'เสร็จสิ้น'}
                  </span>
                </div>
                
                <div className="p-5 flex-1 bg-white">
                  <div className="space-y-3 mb-4">
                    {order.order_items.map((item, idx) => (
                      <div key={idx} className="flex flex-col text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start">
                          <span className="text-gray-700 font-medium">
                            <span className="text-blue-600 font-bold mr-1">{item.qty}x</span> 
                            {item.products?.name || "สินค้า"}
                          </span>
                          <span className="font-bold text-gray-800">{(item.unit_price * item.qty).toFixed(2)} ฿</span>
                        </div>
                        {item.remark && (
                          <div className="bg-yellow-50 text-yellow-800 p-2 rounded-md mt-1 text-xs border border-yellow-100">
                            <span className="font-bold">หมายเหตุ:</span> {item.remark}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-gray-500 font-bold text-sm">ยอดรวมทั้งสิ้น</span>
                    <span className="text-2xl font-black text-blue-600">{order.total_amount.toFixed(2)} ฿</span>
                  </div>
                  
                  {order.status === 'pending' && (
                    <button 
                      onClick={() => markAsCompleted(order.id)} 
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm"
                    >
                      ✅ ปิดบิล (ชำระเงินเรียบร้อย)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}