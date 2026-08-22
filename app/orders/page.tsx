"use client";

import { useState, useEffect, useRef } from "react";
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
  delivery_address: string;
  slip_image: string;
  customer_name?: string;
  customer_phone?: string;
  order_items: OrderItem[];
}

interface ChatMessage {
  id: string;
  sender_type: "CUSTOMER" | "STORE";
  message: string;
  created_at: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "processing" | "shipped" | "completed">("all");

  // ระบบแชท
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          // ดึงเฉพาะออเดอร์ ONLINE เท่านั้น
          const { data, error } = await supabase
            .from("orders")
            .select(`*, order_items (*, products (name))`)
            .eq("store_id", profile.store_id)
            .eq("order_source", "ONLINE")
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

  // ค้นหาแชทเมื่อเปิดหน้าต่าง
  useEffect(() => {
    if (!activeChatOrder) return;
    let isMounted = true;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("order_messages")
        .select("*")
        .eq("order_id", activeChatOrder.id)
        .order("created_at", { ascending: true });
      if (data && isMounted) setMessages(data);
    };
    fetchMessages();

    // ฟังแชท Real-time
    const channel = supabase.channel(`admin_chat_${activeChatOrder.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${activeChatOrder.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      ).subscribe();

    return () => { 
      isMounted = false;
      supabase.removeChannel(channel); 
    };
  }, [activeChatOrder]);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  const filteredOrders = orders.filter(order => {
    if (filter === "all") return true;
    return order.status === filter;
  });

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);
        
      if (error) throw error;
      
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if(activeChatOrder && activeChatOrder.id === orderId) {
          setActiveChatOrder(prev => prev ? {...prev, status: newStatus} : null);
      }
    } catch (error: unknown) {
      if (error instanceof Error) alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatOrder) return;

    const msgText = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("order_messages").insert([{
        order_id: activeChatOrder.id,
        sender_type: "STORE",
        message: msgText
      }]);
      if (error) setNewMessage(msgText);
    } catch {
       setNewMessage(msgText);
    }
  };

  // ฟังก์ชันช่วยแปลสถานะ
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-sm">รอรับออเดอร์</span>;
      case "processing": return <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 shadow-sm">จัดเตรียม</span>;
      case "shipped": return <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-sm">กำลังส่ง</span>;
      case "completed": return <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-100 text-green-800 border border-green-200 shadow-sm">เสร็จสิ้น</span>;
      default: return <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 shadow-sm">{status}</span>;
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูลคำสั่งซื้อ...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 font-sans pb-20 relative">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-black text-blue-900 flex items-center gap-2">🌐 ระบบจัดการออนไลน์ & แชท</h1>
            <p className="text-sm text-gray-500 mt-1 font-medium">จัดการสถานะจัดส่ง และแชทพูดคุยกับลูกค้าออนไลน์</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            {/* เปลี่ยนเป็นปุ่มกลับหน้า Home */}
            <button onClick={() => router.push("/")} className="cursor-pointer flex-1 md:flex-none bg-blue-900 hover:bg-blue-800 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
              🏠 กลับหน้าหลัก (Home)
            </button>
          </div>
        </div>

        {/* เมนูตัวกรอง */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: "all", label: `ทั้งหมด (${orders.length})`, bg: "bg-gray-800" },
            { id: "pending", label: `รอรับ (${orders.filter(o => o.status === "pending").length})`, bg: "bg-yellow-500" },
            { id: "processing", label: `จัดเตรียม (${orders.filter(o => o.status === "processing").length})`, bg: "bg-blue-500" },
            { id: "shipped", label: `กำลังส่ง (${orders.filter(o => o.status === "shipped").length})`, bg: "bg-indigo-500" },
            { id: "completed", label: `เสร็จสิ้น (${orders.filter(o => o.status === "completed").length})`, bg: "bg-green-600" }
          ].map(btn => (
            <button 
              key={btn.id}
              onClick={() => setFilter(btn.id as "all" | "pending" | "processing" | "shipped" | "completed")} 
              className={`cursor-pointer px-5 py-2.5 rounded-full font-bold whitespace-nowrap transition-all text-sm border ${filter === btn.id ? `${btn.bg} text-white border-transparent shadow-md` : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-16 text-center shadow-sm border border-gray-100">
            <span className="text-6xl opacity-50 block mb-4">📭</span>
            <h3 className="text-xl font-black text-gray-500">ไม่มีรายการคำสั่งซื้อออนไลน์ในหมวดหมู่นี้</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOrders.map(order => (
              <div key={order.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col transition-all hover:shadow-lg group">
                <div className="p-5 flex justify-between items-center border-b border-gray-50 bg-gray-50/50">
                  <div>
                    <h3 className="font-black text-lg text-gray-800">{order.doc_no}</h3>
                    <p className="text-xs font-bold text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(order.status)}
                  </div>
                </div>
                
                <div className="p-5 flex-1 bg-white">
                  {order.delivery_address && (
                    <div className="mb-4 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-sm">
                      <span className="font-bold text-blue-800 text-xs uppercase block mb-1">📍 ที่อยู่จัดส่ง:</span>
                      <p className="text-gray-700 font-medium whitespace-pre-wrap leading-relaxed">{order.delivery_address}</p>
                      {order.customer_name && <p className="text-xs text-gray-500 mt-2 font-bold">👤 {order.customer_name} {order.customer_phone ? `(${order.customer_phone})` : ''}</p>}
                    </div>
                  )}

                  <div className="space-y-3 mb-2">
                    <span className="font-bold text-gray-400 text-xs uppercase block">รายการสินค้า:</span>
                    {order.order_items.map((item, idx) => (
                      <div key={idx} className="flex flex-col text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start">
                          <span className="text-gray-700 font-bold">
                            <span className="text-blue-600 mr-1.5">{item.qty}x</span> 
                            {item.products?.name || "สินค้า"}
                          </span>
                          <span className="font-black text-gray-800">{(item.unit_price * item.qty).toLocaleString()} ฿</span>
                        </div>
                        {item.remark && (
                          <div className="bg-orange-50 text-orange-600 p-2 rounded-lg mt-1.5 text-xs font-bold border border-orange-100 w-fit">
                            💬 {item.remark}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-gray-50 border-t border-gray-100">
                  <div className="flex justify-between items-end mb-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-gray-500 font-bold text-sm">ยอดรวมทั้งสิ้น</span>
                    <span className="text-2xl font-black text-blue-600">{order.total_amount.toLocaleString()} ฿</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setActiveChatOrder(order)} 
                      className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95"
                    >
                      💬 อัปเดตสถานะ / แชท
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* หน้าต่าง Chat & อัปเดตสถานะ (Modal) */}
      {activeChatOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in-up border border-gray-100">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-800 p-5 flex justify-between items-center z-10 shadow-md shrink-0">
              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  ออเดอร์: <span className="text-blue-200">{activeChatOrder.doc_no}</span>
                </h3>
              </div>
              <button onClick={() => setActiveChatOrder(null)} className="cursor-pointer w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center font-bold text-white transition-colors">
                ✕
              </button>
            </div>

            {/* ส่วนควบคุมสถานะออเดอร์ */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 shadow-inner">
              <button onClick={() => updateOrderStatus(activeChatOrder.id, 'processing')} className={`cursor-pointer px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all active:scale-95 ${activeChatOrder.status === 'processing' ? 'bg-blue-600 text-white shadow-md border-blue-600' : 'bg-white border border-gray-300 text-gray-600 hover:bg-blue-50'}`}>
                📦 1. จัดเตรียม
              </button>
              <button onClick={() => updateOrderStatus(activeChatOrder.id, 'shipped')} className={`cursor-pointer px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all active:scale-95 ${activeChatOrder.status === 'shipped' ? 'bg-indigo-600 text-white shadow-md border-indigo-600' : 'bg-white border border-gray-300 text-gray-600 hover:bg-indigo-50'}`}>
                🛵 2. กำลังส่ง
              </button>
              <button onClick={() => updateOrderStatus(activeChatOrder.id, 'completed')} className={`cursor-pointer px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all active:scale-95 ${activeChatOrder.status === 'completed' ? 'bg-green-600 text-white shadow-md border-green-600' : 'bg-white border border-gray-300 text-gray-600 hover:bg-green-50'}`}>
                ✅ 3. เสร็จสิ้น
              </button>
            </div>

            {/* พื้นที่แชท */}
            <div className="flex-1 overflow-y-auto p-5 bg-gray-50/80 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <span className="text-4xl mb-2 opacity-50">💬</span>
                  <p className="text-sm font-bold">ยังไม่มีข้อความสนทนา พิมพ์เพื่อทักทายลูกค้า</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isStore = msg.sender_type === "STORE";
                  const time = new Date(msg.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={msg.id} className={`flex flex-col ${isStore ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-end gap-2">
                        {!isStore && <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shadow-sm">C</div>}
                        <div className={`max-w-[280px] px-4 py-3 rounded-2xl text-sm shadow-sm font-medium ${isStore ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>
                          {msg.message}
                        </div>
                      </div>
                      <span className={`text-[10px] text-gray-400 mt-1 font-bold ${isStore ? 'mr-1' : 'ml-10'}`}>{time}</span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ช่องพิมพ์ข้อความ */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-3 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="ตอบกลับลูกค้าที่นี่..." 
                className="flex-1 px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm font-medium transition-all"
              />
              <button type="submit" disabled={!newMessage.trim()} className="cursor-pointer w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all shadow-md shadow-blue-600/30">
                ➤
              </button>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}