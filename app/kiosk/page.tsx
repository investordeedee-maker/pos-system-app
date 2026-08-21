"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface Product { id: string; name: string; price: number; sell_price: number; stock_qty: number; is_vat_exempt: boolean; image_url: string; }
interface CartItem extends Product { cart_qty: number; remark?: string; }
interface StoreSettings { id: string; name: string; address: string; logo_url: string; promptpay_number: string; phone_number: string; receipt_title: string; receipt_footer: string; tax_id: string; }
interface ReceiptData { docNo: string; items: CartItem[]; totalAmount: number; totalExempt: number; totalVatable: number; vatAmount: number; date: Date; }
interface CustomWindow extends Window { webkitAudioContext?: typeof AudioContext; }

// ฟังก์ชันสร้าง Payload สำหรับ PromptPay
function generatePromptPayPayload(mobileOrId: string, amount: number): string {
  const cleanId = mobileOrId.replace(/[^0-9]/g, "");
  let targetField = "";
  if (cleanId.length === 10) {
    const formattedMobile = "0066" + cleanId.substring(1);
    targetField = "01" + formattedMobile.length.toString().padStart(2, "0") + formattedMobile;
  } else if (cleanId.length === 13) {
    targetField = "0213" + cleanId;
  } else return "";

  const merchantAccountInfo = "0016A000000677010111" + targetField;
  const tag29 = "29" + merchantAccountInfo.length.toString().padStart(2, "0") + merchantAccountInfo;
  const asciiAmount = amount.toFixed(2);
  const payloadWithoutCrc = "000201010211" + tag29 + "5802TH530376454" + asciiAmount.length.toString().padStart(2, "0") + asciiAmount + "6304";
  
  let crc = 0xFFFF;
  for (let i = 0; i < payloadWithoutCrc.length; i++) {
    crc ^= payloadWithoutCrc.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return payloadWithoutCrc + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

let audioCtx: AudioContext | null = null;
const playBeep = () => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as CustomWindow).webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = "sine"; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } catch { }
};

export default function KioskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Kiosk States
  const [step, setStep] = useState<"WELCOME" | "MENU" | "PAYMENT" | "SUCCESS">("WELCOME");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // โหลดข้อมูลร้านค้าและสินค้า
  useEffect(() => {
    let isMounted = true;
    const initKiosk = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (profile?.store_id && isMounted) {
          const { data: storeData } = await supabase.from("stores").select("*").eq("id", profile.store_id).single();
          if (storeData) setStoreSettings(storeData);
          const { data: productsData } = await supabase.from("products").select("*").eq("store_id", profile.store_id).order("sort_order", { ascending: true });
          if (productsData) setProducts(productsData.map((p: Product) => ({ ...p, price: p.sell_price })));
        }
      } catch { } finally { if (isMounted) setLoading(false); }
    };
    initKiosk();
    
    // ตรวจสอบสถานะ Fullscreen
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { 
      isMounted = false; 
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [router]);

  // ฟังก์ชันสลับ Fullscreen (เปิด/ปิด)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // ระบบ Auto-Reset คืนค่าหน้าจอถ้าไม่มีการขยับเกิน 60 วินาที
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      if (step === "MENU" || step === "PAYMENT") {
        timeout = setTimeout(() => {
          setCart([]);
          setStep("WELCOME");
        }, 60000);
      }
    };
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    window.addEventListener("click", resetTimer);
    resetTimer();
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [step]);

  // นับถอยหลังหน้า SUCCESS เพื่อกลับไปหน้า WELCOME
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "SUCCESS") {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      } else {
        timer = setTimeout(() => {
          setStep("WELCOME");
          setCart([]);
          setReceiptData(null);
          setCountdown(10);
        }, 0);
      }
    }
    return () => clearTimeout(timer);
  }, [step, countdown]);

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.cart_qty, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.cart_qty, 0);

  const handleAddToCart = (product: Product) => {
    playBeep();
    if (product.stock_qty <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) return prev.map((item) => item.id === product.id ? { ...item, cart_qty: item.cart_qty + 1 } : item);
      return [...prev, { ...product, cart_qty: 1 }];
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    playBeep();
    setCart((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (existing?.cart_qty === 1) return prev.filter((item) => item.id !== productId);
      return prev.map((item) => item.id === productId ? { ...item, cart_qty: item.cart_qty - 1 } : item);
    });
  };

  const generateDocNo = async () => {
    const now = new Date();
    const prefix = `ABB${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-`;
    const { data: lastOrder } = await supabase.from("orders").select("doc_no").eq("store_id", storeSettings?.id).like("doc_no", `${prefix}%`).order("doc_no", { ascending: false }).limit(1);
    let runningNum = 1;
    if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) runningNum = parseInt(lastOrder[0].doc_no.split("-")[1], 10) + 1;
    return `${prefix}${runningNum.toString().padStart(4, '0')}`;
  };

  const handleConfirmPayment = async () => {
    playBeep();
    if (!storeSettings?.id || cart.length === 0) return;
    setIsProcessing(true);
    try {
      const docNo = await generateDocNo();
      const now = new Date();

      const { data: orderData } = await supabase.from("orders").insert([{ 
        store_id: storeSettings.id, doc_no: docNo, order_source: "KIOSK", status: "completed", 
        total_amount: totalAmount, payment_method: "transfer", kitchen_status: "pending", doc_type: "ABB"
      }]).select().single();

      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.price, remark: "" }));
      await supabase.from("order_items").insert(orderItemsToInsert);
      
      for (const item of cart) {
        const newBalance = item.stock_qty - item.cart_qty;
        await supabase.from("products").update({ stock_qty: newBalance }).eq("id", item.id);
        await supabase.from("inventory_transactions").insert([{
          store_id: storeSettings.id, product_id: item.id, transaction_type: "OUT",
          quantity: item.cart_qty, balance_after: newBalance, reference_doc: docNo, notes: "สั่งผ่านตู้ Kiosk"
        }]);
      }
      
      const totalExempt = cart.filter(item => item.is_vat_exempt).reduce((sum, item) => sum + item.price * item.cart_qty, 0);
      const grossVatable = totalAmount - totalExempt;
      const totalVatable = grossVatable / 1.07;
      const vatAmount = grossVatable - totalVatable;

      setReceiptData({ docNo, items: cart, totalAmount, totalExempt, totalVatable, vatAmount, date: now });
      setProducts(prev => prev.map(p => { const sold = cart.find(c => c.id === p.id); return sold ? { ...p, stock_qty: p.stock_qty - sold.cart_qty } : p; }));
      
      setStep("SUCCESS");
      setTimeout(() => window.print(), 500);
    } catch { alert("เกิดข้อผิดพลาด กรุณาติดต่อพนักงาน"); } finally { setIsProcessing(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500 text-2xl">กำลังเริ่มระบบ Kiosk...</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media screen { .print-area { display: none; } }
        @media print {
          @page { margin: 0; size: 58mm auto; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 58mm; padding: 2mm; color: #000; font-family: 'Courier New', Courier, monospace, sans-serif; background: white; font-size: 10px; line-height: 1.2; }
          .print-area img { display: block; max-width: 45px; height: auto; margin: 0 auto 5px auto; object-fit: contain; }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="h-[100dvh] bg-gray-50 font-sans flex flex-col select-none no-print overflow-hidden">
        
        {/* หน้า Welcome */}
        {step === "WELCOME" && (
          <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 text-white relative overflow-hidden transition-all duration-500">
            {/* 🛠️ ปุ่มสำหรับทำ Fullscreen ซ่อนอยู่มุมขวาบน (พนักงานใช้) */}
            <button onClick={toggleFullscreen} className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors z-50">
              {isFullscreen ? "🗗" : "🖵"}
            </button>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
            
            <div onClick={() => { playBeep(); setStep("MENU"); }} className="cursor-pointer w-full h-full flex flex-col items-center justify-center relative z-10 active:scale-95 transition-transform duration-300">
              <div className="bg-white/10 backdrop-blur-xl p-16 rounded-[3rem] shadow-2xl border border-white/20 flex flex-col items-center animate-fade-in-up">
                {storeSettings?.logo_url ? (
                  <img src={storeSettings.logo_url} alt="Logo" className="w-48 h-48 rounded-full object-cover border-8 border-white shadow-2xl mb-8 bg-white" />
                ) : <div className="w-48 h-48 rounded-full bg-white text-blue-600 flex items-center justify-center text-6xl font-black mb-8 shadow-2xl">{storeSettings?.name?.charAt(0) || "S"}</div>}
                
                <h1 className="text-5xl md:text-7xl font-black mb-6 drop-shadow-xl tracking-tight text-center leading-tight">
                  ยินดีต้อนรับสู่ <br/><span className="text-yellow-300">{storeSettings?.name}</span>
                </h1>
                
                <div className="mt-8 bg-white text-blue-700 px-12 py-6 rounded-full font-black text-3xl shadow-[0_0_40px_rgba(255,255,255,0.4)] animate-pulse flex items-center gap-4">
                  <span className="text-4xl">👆</span> แตะหน้าจอเพื่อเริ่มสั่งอาหาร
                </div>
              </div>
            </div>
          </div>
        )}

        {/* หน้า Menu */}
        {step === "MENU" && (
          <div className="flex-1 flex flex-col h-full bg-gray-100 animate-fade-in">
            <div className="bg-white shadow-sm p-5 flex justify-between items-center z-10 border-b border-gray-200">
              <div className="flex items-center gap-4">
                {storeSettings?.logo_url && <img src={storeSettings.logo_url} alt="Logo" className="w-14 h-14 rounded-full object-cover border-2 border-blue-100 shadow-sm" />}
                <div>
                  <h1 className="text-2xl font-black text-gray-800 tracking-tight">{storeSettings?.name}</h1>
                  <p className="text-sm font-bold text-blue-600">กรุณาเลือกรายการสินค้าที่ต้องการ</p>
                </div>
              </div>
              <button onClick={() => { playBeep(); setStep("WELCOME"); setCart([]); }} className="cursor-pointer px-8 py-4 bg-red-50 text-red-600 font-bold rounded-2xl text-xl hover:bg-red-100 transition-colors shadow-sm border border-red-100">
                ✕ ยกเลิกการสั่ง
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="w-2/3 overflow-y-auto p-6 md:p-8 bg-[#f8fafc]">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                  {products.map((product) => (
                    <div key={product.id} onClick={() => handleAddToCart(product)} className={`bg-white p-5 rounded-[2rem] shadow-sm border-2 ${product.stock_qty <= 0 ? 'border-gray-200 opacity-50' : 'border-transparent hover:border-blue-400 hover:shadow-xl cursor-pointer'} flex flex-col active:scale-[0.98] transition-all duration-200 group`}>
                      <div className="w-full aspect-square bg-gray-50 rounded-3xl mb-4 flex items-center justify-center relative overflow-hidden group-hover:scale-105 transition-transform duration-300">
                        {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <span className="text-6xl opacity-20">📦</span>}
                        {product.stock_qty <= 0 && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center"><span className="bg-red-600 text-white px-6 py-2 rounded-full font-black text-lg shadow-lg">สินค้าหมด</span></div>}
                      </div>
                      <h3 className="font-bold text-gray-800 text-xl line-clamp-2 h-14 leading-tight">{product.name}</h3>
                      <div className="mt-4 flex justify-between items-center">
                        <div className="text-3xl font-black text-blue-600">฿{product.price.toLocaleString()}</div>
                        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-black group-hover:bg-blue-600 group-hover:text-white transition-colors">+</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-1/3 bg-white border-l border-gray-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-20 relative">
                <div className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-md z-10 shrink-0">
                  <h2 className="text-2xl font-black flex justify-between items-center">
                    รายการที่สั่ง 
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-4 py-1.5 rounded-full text-lg shadow-inner">{totalItems} ชิ้น</span>
                  </h2>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-gray-50/50">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-6 shadow-inner text-6xl">🛒</div>
                      <p className="text-2xl font-bold text-gray-400">ยังไม่ได้เลือกสินค้า</p>
                      <p className="text-gray-400 mt-2">แตะเลือกสินค้าจากเมนูด้านซ้าย</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4 animate-fade-in-up">
                        <div className="flex justify-between items-start gap-4">
                          <h4 className="text-xl font-bold text-gray-800 leading-tight flex-1">{item.name}</h4>
                          <div className="text-2xl font-black text-blue-600 shrink-0">฿{(item.price * item.cart_qty).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-50">
                          <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
                            <button onClick={() => handleRemoveFromCart(item.id)} className="cursor-pointer w-12 h-12 bg-white rounded-xl shadow-sm font-black text-2xl text-gray-600 active:scale-90 transition-transform">-</button>
                            <span className="font-black text-2xl w-12 text-center text-gray-800">{item.cart_qty}</span>
                            <button onClick={() => handleAddToCart(item)} className="cursor-pointer w-12 h-12 bg-blue-600 rounded-xl shadow-sm font-black text-2xl text-white active:scale-90 transition-transform">+</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                <div className="p-6 md:p-8 bg-white border-t border-gray-100 z-10 shrink-0">
                  <div className="flex justify-between items-end mb-6 bg-gray-50 p-6 rounded-3xl border border-gray-200">
                    <span className="text-gray-500 font-bold text-xl uppercase tracking-wider">ยอดรวมทั้งสิ้น</span>
                    <span className="text-5xl font-black text-blue-600 tracking-tighter">฿{totalAmount.toLocaleString()}</span>
                  </div>
                  <button onClick={() => { playBeep(); setStep("PAYMENT"); }} disabled={cart.length === 0} className={`cursor-pointer w-full py-6 rounded-[2rem] font-black text-3xl transition-all active:scale-95 ${cart.length > 0 ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_10px_30px_rgba(37,99,235,0.3)] hover:shadow-[0_15px_40px_rgba(37,99,235,0.4)]" : "bg-gray-200 text-gray-400"}`}>
                    ชำระเงิน <span className="ml-2">➔</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* หน้า Payment */}
        {step === "PAYMENT" && (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#f8fafc] p-6 animate-fade-in relative">
            <button onClick={() => { playBeep(); setStep("MENU"); }} className="cursor-pointer absolute top-8 left-8 px-8 py-4 bg-white border border-gray-200 text-gray-600 font-bold rounded-2xl text-xl hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm flex items-center gap-3 z-10">
              <span className="text-2xl">←</span> กลับไปแก้ไขรายการ
            </button>

            <div className="bg-white p-12 md:p-16 rounded-[3rem] shadow-2xl max-w-2xl w-full text-center border border-gray-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-blue-400 via-blue-600 to-indigo-600"></div>
              
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-inner">📱</div>
              <h2 className="text-4xl font-black text-gray-800 mb-8 tracking-tight">สแกน QR Code เพื่อชำระเงิน</h2>
              
              <div className="bg-blue-50 text-blue-800 py-4 px-8 rounded-3xl inline-block font-bold text-xl mb-10 border border-blue-100 shadow-sm">
                ยอดที่ต้องชำระ: <span className="text-5xl font-black ml-4 tracking-tighter">฿{totalAmount.toLocaleString()}</span>
              </div>
              
              <div className="flex justify-center mb-12">
                {storeSettings?.promptpay_number ? (
                  <div className="p-8 bg-white border-2 border-gray-100 rounded-[2.5rem] shadow-xl relative animate-pulse-slow">
                    <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={320} />
                    <div className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-8 py-3 rounded-full font-bold shadow-lg whitespace-nowrap text-lg">
                      รองรับแอปทุกธนาคาร
                    </div>
                  </div>
                ) : <div className="text-red-500 font-bold text-2xl p-8 bg-red-50 rounded-3xl border border-red-100">⚠️ ร้านค้าย่อยยังไม่ได้ตั้งค่าเบอร์ PromptPay</div>}
              </div>

              <button onClick={handleConfirmPayment} disabled={isProcessing} className="cursor-pointer w-full py-6 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-[2rem] font-black text-3xl shadow-[0_10px_30px_rgba(34,197,94,0.3)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {isProcessing ? "⏳ กำลังพิมพ์ใบเสร็จ..." : "✅ ฉันโอนเงินเรียบร้อยแล้ว"}
              </button>
            </div>
          </div>
        )}

        {/* หน้า Success */}
        {step === "SUCCESS" && (
          <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-green-500 to-green-700 text-white relative animate-fade-in">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
            
            <div className="bg-white/10 backdrop-blur-xl p-16 rounded-[3rem] shadow-2xl border border-white/20 flex flex-col items-center z-10 text-center animate-fade-in-up">
              <div className="w-48 h-48 bg-white text-green-600 rounded-full flex items-center justify-center text-8xl shadow-[0_0_50px_rgba(255,255,255,0.5)] mb-10 animate-bounce">
                ✓
              </div>
              <h2 className="text-5xl md:text-7xl font-black mb-6 drop-shadow-lg tracking-tight">ทำรายการสำเร็จ!</h2>
              <p className="text-3xl font-medium mb-12 bg-white/20 px-10 py-5 rounded-full backdrop-blur-md shadow-inner">
                🧾 กรุณารับใบเสร็จด้านล่าง เพื่อรอรับสินค้า
              </p>
              
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden mb-6">
                <div className="h-full bg-white transition-all duration-1000 ease-linear" style={{ width: `${(countdown / 10) * 100}%` }}></div>
              </div>
              <div className="text-xl font-bold text-green-100">
                หน้าจอจะกลับสู่เริ่มต้นอัตโนมัติใน <span className="text-white text-3xl font-black mx-2">{countdown}</span> วินาที
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="print-area">
        {receiptData && storeSettings && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              {storeSettings?.logo_url && <img src={storeSettings.logo_url} alt="Logo" />}
              <h1 style={{ fontWeight: 'bold', fontSize: '13px', margin: 0 }}>{storeSettings?.name}</h1>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>{storeSettings?.address}</p>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>โทร: {storeSettings?.phone_number}</p>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>TAX ID: {storeSettings?.tax_id}</p>
              <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '4px 0', borderBottom: '1px dashed #000', paddingBottom: '2px' }}>
                {storeSettings?.receipt_title || "ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ"} (KIOSK)
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '9px' }}>
              <span>เลขที่: {receiptData?.docNo}</span>
              <span>วันที่: {receiptData?.date.toLocaleString('th-TH')}</span>
            </div>
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>
              {receiptData?.items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.name} {item.is_vat_exempt && "(V0)"}</span>
                    <span>{(item.price * item.cart_qty).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: '8px' }}>{item.cart_qty} x {item.price.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', margin: '4px 0' }}>
              <span>ยอดสุทธิ (สแกนจ่าย)</span><span>{receiptData?.totalAmount.toFixed(2)}</span>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '8px' }}>
              <p style={{ margin: 0 }}>{storeSettings?.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ"}</p>
              <p style={{ margin: '2px 0 0 0' }}>สั่งซื้อผ่านตู้บริการอัตโนมัติ (Kiosk)</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}