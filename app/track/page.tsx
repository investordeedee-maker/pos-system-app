"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface OrderItem {
  id: string;
  qty: number;
  unit_price: number;
  remark: string;
  products: { name: string };
}

interface Order {
  id: string;
  doc_no: string;
  status: string;
  total_amount: number;
  delivery_address: string;
  created_at: string;
  order_items: OrderItem[];
}

interface ChatMessage {
  id: string;
  sender_type: "CUSTOMER" | "STORE";
  message: string;
  created_at: string;
}

export default function OrderTrackingPage() {
  const router = useRouter();
  const [searchDocNo, setSearchDocNo] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // เลื่อนแชทลงล่างสุดอัตโนมัติ
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // ค้นหาออเดอร์
  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchDocNo.trim()) return;
    
    setIsLoading(true);
    setErrorMsg("");
    setOrder(null);
    setMessages([]);

    try {
      const cleanDocNo = searchDocNo.trim().toUpperCase();
      
      // ดึงข้อมูลออเดอร์
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`*, order_items(*, products(name))`)
        .eq("doc_no", cleanDocNo)
        .single();

      if (orderError || !orderData) {
        setErrorMsg("ไม่พบหมายเลขคำสั่งซื้อนี้ กรุณาตรวจสอบอีกครั้ง");
        return;
      }

      setOrder(orderData);

      // ดึงข้อมูลแชท
      const { data: chatData, error: chatError } = await supabase
        .from("order_messages")
        .select("*")
        .eq("order_id", orderData.id)
        .order("created_at", { ascending: true });

      if (!chatError && chatData) {
        setMessages(chatData);
      }
    } catch {
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    } finally {
      setIsLoading(false);
    }
  };

  // ส่งข้อความแชท
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !order) return;

    const msgText = newMessage.trim();
    setNewMessage(""); // เคลียร์ช่องพิมพ์ทันทีเพื่อ UX ที่ดี

    try {
      const { error } = await supabase.from("order_messages").insert([{
        order_id: order.id,
        sender_type: "CUSTOMER",
        message: msgText
      }]);

      if (error) {
        alert("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่");
        setNewMessage(msgText); // คืนค่าข้อความถ้าส่งไม่ผ่าน
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ระบบ Real-time: รับฟังการอัปเดตสถานะและแชทใหม่
  useEffect(() => {
    if (!order) return;

    // ติดตามสถานะออเดอร์
    const orderChannel = supabase.channel(`order_status_${order.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, 
        (payload) => {
          setOrder((prev) => prev ? { ...prev, status: payload.new.status } : null);
        }
      ).subscribe();

    // ติดตามข้อความแชทใหม่
    const chatChannel = supabase.channel(`order_chat_${order.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${order.id}` }, 
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      ).subscribe();

    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [order]);

  // ฟังก์ชันช่วยแปลสถานะ
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "pending": return { text: "รอรับออเดอร์", color: "bg-yellow-500", step: 1 };
      case "processing": return { text: "กำลังจัดเตรียม", color: "bg-blue-500", step: 2 };
      case "shipped": return { text: "กำลังจัดส่ง", color: "bg-indigo-500", step: 3 };
      case "completed": return { text: "ส่งสำเร็จแล้ว", color: "bg-green-500", step: 4 };
      case "cancelled": return { text: "ยกเลิกแล้ว", color: "bg-red-500", step: 0 };
      default: return { text: "รอดำเนินการ", color: "bg-gray-400", step: 1 };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-10">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl">📦</div>
            <div>
              <h1 className="font-black text-lg text-gray-800">ติดตามสถานะออเดอร์</h1>
              <p className="text-xs text-blue-600 font-bold">เช็คสถานะ & แชทกับร้านค้า</p>
            </div>
          </div>
          <button onClick={() => router.push("/store")} className="cursor-pointer text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200">
            ← กลับหน้าร้าน
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4">
        {/* กล่องค้นหา */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
          <h2 className="text-sm font-bold text-gray-600 mb-3">กรอกหมายเลขคำสั่งซื้อของคุณ</h2>
          <form onSubmit={handleSearchOrder} className="flex gap-2">
            <input 
              type="text" 
              value={searchDocNo}
              onChange={(e) => setSearchDocNo(e.target.value)}
              placeholder="เช่น OL260821-0001" 
              className="flex-1 p-3.5 border border-gray-300 rounded-2xl bg-gray-50 focus:bg-white focus:border-blue-500 outline-none uppercase font-bold"
              required
            />
            <button type="submit" disabled={isLoading} className="cursor-pointer bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold px-6 rounded-2xl shadow-md transition-all active:scale-95">
              {isLoading ? "⏳" : "ค้นหา"}
            </button>
          </form>
          {errorMsg && <p className="text-red-500 text-sm font-bold mt-3 text-center">{errorMsg}</p>}
        </div>

        {/* ข้อมูลออเดอร์ (แสดงเมื่อค้นหาเจอ) */}
        {order && (
          <div className="space-y-6 animate-fade-in-up">
            
            {/* แถบสถานะ */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <span className="font-black text-xl text-gray-800">{order.doc_no}</span>
                <span className={`px-3 py-1 rounded-full text-white text-xs font-bold ${getStatusDisplay(order.status).color}`}>
                  {getStatusDisplay(order.status).text}
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className="relative pt-2">
                <div className="flex mb-2 items-center justify-between">
                  {['รอรับ', 'เตรียม', 'จัดส่ง', 'สำเร็จ'].map((stepName, idx) => {
                    const stepNum = idx + 1;
                    const currentStep = getStatusDisplay(order.status).step;
                    const isCompleted = currentStep >= stepNum;
                    const isCurrent = currentStep === stepNum;
                    return (
                      <div key={idx} className="flex flex-col items-center relative z-10 w-1/4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-1 transition-colors ${isCompleted ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-400'}`}>
                          {isCompleted ? '✓' : stepNum}
                        </div>
                        <span className={`text-[10px] font-bold ${isCurrent ? 'text-blue-600' : 'text-gray-400'}`}>{stepName}</span>
                      </div>
                    );
                  })}
                </div>
                {/* เส้นเชื่อม */}
                <div className="absolute top-6 left-[12.5%] right-[12.5%] h-1 bg-gray-200 -z-0">
                  <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${(Math.max(0, getStatusDisplay(order.status).step - 1) / 3) * 100}%` }}></div>
                </div>
              </div>
            </div>

            {/* ระบบแชท */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[400px]">
              <div className="bg-gray-50 p-4 border-b border-gray-100 font-bold text-gray-700 flex items-center gap-2">
                💬 แชทสอบถามร้านค้า 
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ออนไลน์</span>
              </div>
              
              {/* พื้นที่ข้อความ */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <span className="text-4xl mb-2">👋</span>
                    <p className="text-sm font-bold">พิมพ์ข้อความเพื่อสอบถามร้านค้า</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isCustomer = msg.sender_type === "CUSTOMER";
                    const time = new Date(msg.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={msg.id} className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${isCustomer ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'}`}>
                          {msg.message}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 mx-1">{time}</span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ช่องพิมพ์ข้อความ */}
              <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-100 flex gap-2">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="พิมพ์ข้อความที่นี่..." 
                  className="flex-1 px-4 py-2.5 bg-gray-100 border-none rounded-full outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button type="submit" disabled={!newMessage.trim()} className="cursor-pointer w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 active:scale-90 transition-transform">
                  ➤
                </button>
              </form>
            </div>

            {/* สรุปรายการสินค้า */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">สรุปรายการคำสั่งซื้อ</h3>
              <div className="space-y-3 mb-4">
                {order.order_items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-sm">
                    <div>
                      <span className="font-bold text-gray-800">{item.qty}x {item.products.name}</span>
                      {item.remark && <p className="text-orange-500 text-xs mt-0.5">- {item.remark}</p>}
                    </div>
                    <span className="font-bold text-gray-600">{(item.unit_price * item.qty).toLocaleString()} ฿</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <span className="font-bold text-gray-500">ยอดสุทธิ</span>
                <span className="text-2xl font-black text-blue-600">{order.total_amount.toLocaleString()} ฿</span>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}