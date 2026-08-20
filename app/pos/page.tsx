"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface Product { id: string; name: string; price: number; sell_price: number; stock_qty: number; is_vat_exempt: boolean; image_url: string; }
interface CartItem extends Product { cart_qty: number; remark?: string; }
interface StoreSettings { id: string; name: string; address: string; logo_url: string; promptpay_number: string; phone_number: string; receipt_title: string; invoice_title: string; tax_id: string; receipt_footer: string; }
interface ReceiptData { docNo: string; items: CartItem[]; totalAmount: number; totalExempt: number; totalVatable: number; vatAmount: number; paymentMethod: string; cashReceived: number | ""; changeAmount: number; date: Date; }
interface PendingOrderItem { product_id: string; unit_price: number; qty: number; remark?: string; products?: { name: string; is_vat_exempt: boolean; }; }
interface PendingOrder { id: string; doc_no: string; created_at: string; total_amount: number; order_items: PendingOrderItem[]; slip_image?: string; }
interface CustomWindow extends Window { webkitAudioContext?: typeof AudioContext; }

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

const playSuccessBeep = () => { playBeep(); setTimeout(playBeep, 150); };

export default function POSPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [cashReceived, setCashReceived] = useState<string>(""); 
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [savedPendingReceipt, setSavedPendingReceipt] = useState<ReceiptData | null>(null); 
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<PendingOrder | null>(null);
  const [tempInvoiceNo, setTempInvoiceNo] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const initPOS = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (isMounted) router.push("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (profile?.store_id && isMounted) {
          const { data: storeData } = await supabase.from("stores").select("*").eq("id", profile.store_id).single();
          if (storeData) setStoreSettings(storeData);
          const { data: productsData } = await supabase.from("products").select("*").eq("store_id", profile.store_id).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
          if (productsData) setProducts(productsData.map((p: Product) => ({ ...p, price: p.sell_price })));
        }
      } catch { } finally { if (isMounted) setLoading(false); }
    };
    initPOS();
    return () => { isMounted = false; };
  }, [router]);

  const addToCart = (product: Product) => {
    playBeep();
    if (product.stock_qty <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) return prev.map((item) => item.id === product.id ? { ...item, cart_qty: item.cart_qty + 1 } : item);
      return [...prev, { ...product, cart_qty: 1, remark: "" }];
    });
  };

  const removeFromCart = (id: string) => { playBeep(); setCart((prev) => prev.filter((item) => item.id !== id)); };
  const decreaseQuantity = (productId: string) => {
    playBeep();
    setCart((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (existing?.cart_qty === 1) return prev.filter((item) => item.id !== productId);
      return prev.map((item) => item.id === productId ? { ...item, cart_qty: item.cart_qty - 1 } : item);
    });
  };
  const updateRemark = (id: string, remark: string) => setCart((prev) => prev.map((item) => item.id === id ? { ...item, remark } : item));

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.cart_qty, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.cart_qty, 0);
  const totalExempt = cart.filter(item => item.is_vat_exempt).reduce((sum, item) => sum + item.price * item.cart_qty, 0);
  const grossVatable = totalAmount - totalExempt;
  const totalVatable = grossVatable / 1.07;
  const vatAmount = grossVatable - totalVatable;
  const parsedCash = parseFloat(cashReceived) || 0;
  const changeAmount = paymentMethod === "cash" && cashReceived !== "" ? parsedCash - totalAmount : 0;
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const openCheckout = () => {
    playBeep();
    setPaymentMethod("cash"); setCashReceived(""); setShowCheckout(true);
    const now = new Date();
    setTempInvoiceNo(`IV${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-TEMP`);
  };

  const loadPendingOrders = async () => {
    playBeep();
    if (!storeSettings?.id) return;
    try {
      const { data } = await supabase.from("orders").select(`*, order_items(*, products(*))`).eq("store_id", storeSettings.id).eq("status", "pending").order("created_at", { ascending: false });
      setPendingOrders(data || []); setShowPendingModal(true);
    } catch { }
  };

  const handleSavePendingOrder = async () => {
    playBeep();
    if (!storeSettings?.id || cart.length === 0) return;
    setIsProcessing(true);
    try {
      const now = new Date();
      const prefix = `IV${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-`;
      const { data: lastOrder } = await supabase.from("orders").select("doc_no").eq("store_id", storeSettings.id).like("doc_no", `${prefix}%`).order("doc_no", { ascending: false }).limit(1);
      let runningNum = 1;
      if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) runningNum = parseInt(lastOrder[0].doc_no.split("-")[1], 10) + 1;
      const docNo = `${prefix}${runningNum.toString().padStart(4, '0')}`;

      const { data: orderData } = await supabase.from("orders").insert([{ store_id: storeSettings.id, doc_no: docNo, order_source: "POS", status: "pending", total_amount: totalAmount, payment_method: "cash" }]).select().single();
      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.price, remark: item.remark || "" }));
      await supabase.from("order_items").insert(orderItemsToInsert);
      for (const item of cart) await supabase.from("products").update({ stock_qty: item.stock_qty - item.cart_qty }).eq("id", item.id);
      
      setProducts(prev => prev.map(p => { const sold = cart.find(c => c.id === p.id); return sold ? { ...p, stock_qty: p.stock_qty - sold.cart_qty } : p; }));
      setSavedPendingReceipt({ docNo, items: cart, totalAmount, totalExempt, totalVatable, vatAmount, paymentMethod: 'pending', cashReceived: "", changeAmount: 0, date: now });
      playSuccessBeep(); setCart([]); setShowCheckout(false);
    } catch { } finally { setIsProcessing(false); }
  };

  const handleConfirmPayment = async () => {
    playBeep();
    if (!storeSettings?.id || cart.length === 0) return;
    if (paymentMethod === "cash" && (cashReceived === "" || parsedCash < totalAmount)) { alert("กรุณาระบุจำนวนเงินรับให้ครบถ้วนก่อนกดยืนยันชำระเงิน"); return; }
    setIsProcessing(true);
    try {
      const now = new Date();
      const prefix = `IV${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-`;
      const { data: lastOrder } = await supabase.from("orders").select("doc_no").eq("store_id", storeSettings.id).like("doc_no", `${prefix}%`).order("doc_no", { ascending: false }).limit(1);
      let runningNum = 1;
      if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) runningNum = parseInt(lastOrder[0].doc_no.split("-")[1], 10) + 1;
      const docNo = `${prefix}${runningNum.toString().padStart(4, '0')}`;

      const { data: orderData } = await supabase.from("orders").insert([{ store_id: storeSettings.id, doc_no: docNo, order_source: "POS", status: "completed", total_amount: totalAmount, payment_method: paymentMethod }]).select().single();
      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.price, remark: item.remark || "" }));
      await supabase.from("order_items").insert(orderItemsToInsert);
      for (const item of cart) await supabase.from("products").update({ stock_qty: item.stock_qty - item.cart_qty }).eq("id", item.id);
      
      setProducts(prev => prev.map(p => { const sold = cart.find(c => c.id === p.id); return sold ? { ...p, stock_qty: p.stock_qty - sold.cart_qty } : p; }));
      setReceiptData({ docNo, items: cart, totalAmount, totalExempt, totalVatable, vatAmount, paymentMethod, cashReceived: parsedCash, changeAmount, date: now });
      playSuccessBeep(); setCart([]); setShowCheckout(false); setCashReceived("");
    } catch { } finally { setIsProcessing(false); }
  };

  const handlePayPendingOrder = async () => {
    playBeep();
    if (!selectedPendingOrder) return;
    const orderTotal = selectedPendingOrder.total_amount;
    if (paymentMethod === "cash" && (cashReceived === "" || parsedCash < orderTotal)) { alert("กรุณาระบุจำนวนเงินรับให้ครบถ้วนก่อนกดยืนยันชำระเงิน"); return; }
    setIsProcessing(true);
    try {
      await supabase.from("orders").update({ status: "completed", payment_method: paymentMethod }).eq("id", selectedPendingOrder.id);
      const mappedItems: CartItem[] = selectedPendingOrder.order_items.map((oi: PendingOrderItem) => ({ id: oi.product_id, name: oi.products?.name || "สินค้า", price: oi.unit_price, cart_qty: oi.qty, is_vat_exempt: oi.products?.is_vat_exempt || false, remark: oi.remark || "", stock_qty: 0, sell_price: 0, image_url: "" }));
      const tExempt = mappedItems.filter(item => item.is_vat_exempt).reduce((sum, item) => sum + item.price * item.cart_qty, 0);
      const gVatable = orderTotal - tExempt;
      const tVatable = gVatable / 1.07;
      const vAmount = gVatable - tVatable;
      const cAmount = paymentMethod === "cash" && cashReceived !== "" ? parsedCash - orderTotal : 0;

      setReceiptData({ docNo: selectedPendingOrder.doc_no, items: mappedItems, totalAmount: orderTotal, totalExempt: tExempt, totalVatable: tVatable, vatAmount: vAmount, paymentMethod, cashReceived: parsedCash, changeAmount: cAmount, date: new Date() });
      playSuccessBeep(); setSelectedPendingOrder(null); setShowPendingModal(false); setCashReceived("");
    } catch { } finally { setIsProcessing(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดระบบ POS...</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media screen { .print-area { display: none; } }
        @media print {
          @page { margin: 0; size: 58mm auto; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { 
            position: absolute; left: 0; top: 0; width: 58mm; padding: 2mm; 
            color: #000; font-family: 'Courier New', Courier, monospace, sans-serif; 
            background: white; font-size: 10px; line-height: 1.2;
          }
          .print-area img { display: block; max-width: 45px; height: auto; margin: 0 auto 5px auto; object-fit: contain; }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="flex flex-col h-[100dvh] bg-gray-100 font-sans relative no-print overflow-hidden">
        <header className="bg-white shadow-sm px-4 py-3 flex flex-wrap items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              {storeSettings?.logo_url ? (
                <div className="w-10 h-10 relative rounded-md overflow-hidden bg-white border border-gray-100 flex items-center justify-center">
                  <img src={storeSettings.logo_url} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                </div>
              ) : <div className="w-10 h-10 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-lg">{storeSettings?.name ? storeSettings.name.charAt(0) : "S"}</div>}
              <h1 className="text-xl font-black text-gray-800 tracking-tight hidden sm:block">{storeSettings?.name || "Standard POS"}</h1>
            </div>
            <button onClick={() => { playBeep(); router.push("/"); }} className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs md:text-sm border border-gray-200 transition-all">🏠 หน้าหลัก</button>
          </div>
          <div className="flex w-full md:w-auto gap-2 mt-3 md:mt-0 overflow-x-auto pb-1 md:pb-0">
            <input type="text" placeholder="ค้นหาสินค้า..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg w-full md:w-48 outline-none bg-gray-50 text-sm focus:border-blue-400 focus:bg-white flex-shrink-0" />
            <button onClick={loadPendingOrders} className="cursor-pointer bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-2 rounded-lg font-bold shadow-sm text-sm flex-shrink-0 transition-all">🧾 บิลค้าง</button>
            <button onClick={() => { playBeep(); router.push("/dashboard"); }} className="cursor-pointer bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-bold shadow-md text-sm flex-shrink-0 transition-all">📊 แดชบอร์ด</button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-2 md:p-4 bg-gray-100">
            {products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="font-medium text-lg">ยังไม่มีสินค้าในร้าน</p>
                <button onClick={() => { playBeep(); router.push("/products"); }} className="mt-4 text-blue-600 font-bold">ไปเพิ่มสินค้าที่คลังเลย</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-4">
                {filteredProducts.map((product) => (
                  <div key={product.id} onClick={() => addToCart(product)} className={`bg-white p-3 rounded-2xl shadow-sm border ${product.stock_qty <= 0 ? 'border-red-200 opacity-60' : 'border-gray-100 hover:border-blue-400 cursor-pointer'} flex flex-col active:scale-95 transition-transform`}>
                    <div className="w-full aspect-square bg-gray-50 rounded-xl mb-2 flex items-center justify-center relative overflow-hidden border border-gray-100 p-1">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                      ) : <span className="text-gray-400 text-xs">ไม่มีรูป</span>}
                    </div>
                    <h3 className="font-bold text-gray-800 text-sm line-clamp-2 h-10 mt-1">{product.name}</h3>
                    <div className="flex justify-between items-end mt-2">
                      <span className="text-blue-600 font-black text-base md:text-lg">฿{product.price.toLocaleString()}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">คลัง: {product.stock_qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col shrink-0 h-[45%] md:h-auto w-full md:w-[350px] lg:w-[400px] bg-white border-t md:border-t-0 md:border-l border-gray-200 z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:shadow-none">
            <div className="p-3 bg-gray-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-sm font-bold flex items-center gap-2">🛒 ตะกร้า <span className="bg-blue-500 px-2 py-0.5 rounded-full">{totalItems}</span></h2>
              <button onClick={() => { playBeep(); setCart([]); }} className="cursor-pointer text-xs text-red-400 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded transition-colors">ล้างทั้งหมด</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50/50">
              {cart.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 text-sm">ยังไม่ได้เลือกสินค้า</div> : 
                cart.map((item) => (
                  <div key={item.id} className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-1">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-1">
                        <h4 className="text-xs font-bold text-gray-800 line-clamp-1">{item.name}</h4>
                        <div className="text-xs font-bold text-blue-600">฿{item.price.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-1 bg-gray-50 px-1 rounded-lg border border-gray-100">
                        <button onClick={() => decreaseQuantity(item.id)} className="cursor-pointer w-6 h-6 bg-white rounded shadow-sm font-bold text-gray-600 active:scale-90">-</button>
                        <span className="font-bold text-xs w-4 text-center">{item.cart_qty}</span>
                        <button onClick={() => addToCart(item)} className="cursor-pointer w-6 h-6 bg-blue-600 rounded text-white shadow-sm font-bold active:scale-90">+</button>
                        <button onClick={() => removeFromCart(item.id)} className="cursor-pointer w-6 h-6 bg-red-100 rounded text-red-500 shadow-sm font-bold ml-1 active:scale-90">✕</button>
                      </div>
                    </div>
                    <input type="text" placeholder="หมายเหตุ (เช่น หวานน้อย)..." value={item.remark || ""} onChange={(e) => updateRemark(item.id, e.target.value)} className="w-full text-[11px] px-2 py-1.5 border border-gray-200 rounded outline-none bg-gray-50 focus:bg-white focus:border-blue-300 transition-all" />
                  </div>
                ))
              }
            </div>
            
            <div className="p-3 bg-white border-t border-gray-100 shrink-0 pb-safe">
              <div className="flex justify-between items-end mb-3">
                <span className="text-gray-500 font-bold text-sm">ยอดรวม</span>
                <span className="text-2xl font-black text-blue-600">฿{totalAmount.toLocaleString()}</span>
              </div>
              <button onClick={openCheckout} disabled={cart.length === 0} className={`cursor-pointer w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 ${cart.length > 0 ? "bg-blue-600 text-white shadow-lg" : "bg-gray-200 text-gray-400"}`}>
                ดำเนินการชำระเงิน
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCheckout && storeSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4 no-print">
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95dvh] flex flex-col overflow-hidden">
            
            <div className="flex justify-between items-center bg-gray-50 p-4 border-b border-gray-200 shrink-0">
              <h2 className="text-xl font-black text-gray-800">📝 ชำระเงิน / ออกบิล</h2>
              <button onClick={() => { playBeep(); setShowCheckout(false); }} className="cursor-pointer text-gray-500 font-bold text-xl w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">✕</button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="w-full md:w-1/2 bg-gray-50 p-4 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto">
                <div className="space-y-2 mb-4">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex flex-col text-sm text-gray-700 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-bold">{item.cart_qty} x {item.name}</span>
                        <span className="font-black text-blue-600">฿{(item.price * item.cart_qty).toLocaleString()}</span>
                      </div>
                      {item.remark && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded mt-1 self-start">- {item.remark}</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex justify-between items-center text-xl font-black text-blue-600 bg-blue-100 p-4 rounded-xl shrink-0">
                  <span>ยอดที่ต้องชำระ</span><span>฿{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="w-full md:w-1/2 bg-white p-4 flex flex-col overflow-y-auto">
                <label className="block text-sm font-bold text-gray-700 mb-2">รูปแบบการชำระเงิน</label>
                <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
                  <button onClick={() => { playBeep(); setPaymentMethod("cash"); }} className={`cursor-pointer py-3 rounded-xl font-bold border-2 text-base transition-all ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>💵 เงินสด</button>
                  <button onClick={() => { playBeep(); setPaymentMethod("transfer"); }} className={`cursor-pointer py-3 rounded-xl font-bold border-2 text-base transition-all ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>📱 โอนเงิน/QR</button>
                </div>

                <div className="flex-1 flex flex-col justify-center shrink-0 min-h-[150px]">
                  {paymentMethod === "transfer" && (
                    <div className="text-center p-4 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center justify-center">
                      {storeSettings.promptpay_number ? (
                        <><div className="bg-white p-2 rounded-xl shadow-md"><QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={140} /></div><p className="font-bold text-blue-800 mt-2 text-sm">สแกน QR Code เพื่อโอนเงิน</p></>
                      ) : <p className="text-red-500 font-bold">กรุณาตั้งค่าเบอร์ PromptPay</p>}
                    </div>
                  )}
                  {paymentMethod === "cash" && (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                      <label className="block text-xs font-bold text-gray-500 mb-2 text-center uppercase">ระบุจำนวนเงินที่รับจากลูกค้า (บาท)</label>
                      <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="w-full px-4 py-3 text-2xl font-black text-center text-blue-700 border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 transition-all bg-white shadow-sm" placeholder="0.00" />
                      {changeAmount > 0 && (
                        <div className="mt-3 flex justify-between items-center text-lg bg-green-100 border border-green-300 text-green-800 p-3 rounded-xl font-black shadow-sm">
                          <span>เงินทอน</span><span className="text-2xl">฿{changeAmount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2 shrink-0">
                  <div className="flex gap-2">
                    <button onClick={() => { playBeep(); window.print(); }} className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl flex-1 text-sm border border-gray-300 transition-all flex justify-center items-center gap-1">🖨️ พิมพ์แจ้งหนี้</button>
                    <button onClick={handleSavePendingOrder} disabled={isProcessing} className="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold py-3 rounded-xl flex-1 text-sm border border-orange-200 transition-all flex justify-center items-center gap-1">⏳ ค้างชำระ</button>
                  </div>
                  <button onClick={handleConfirmPayment} disabled={isProcessing} className="cursor-pointer w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-lg shadow-lg active:scale-95 transition-all">
                    ✅ ยืนยันชำระเงิน
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {showPendingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4 no-print">
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95dvh] flex flex-col overflow-hidden">
            
            <div className="flex justify-between items-center bg-gray-50 p-4 border-b border-gray-200 shrink-0">
              <h2 className="text-xl font-black text-orange-600">🧾 รายการบิลค้างชำระ</h2>
              <button onClick={() => { playBeep(); setShowPendingModal(false); setSelectedPendingOrder(null); }} className="cursor-pointer text-gray-500 font-bold text-xl w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">✕</button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="w-full md:w-1/2 bg-gray-50 p-4 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto">
                {!selectedPendingOrder ? (
                  pendingOrders.length === 0 ? <p className="text-center text-gray-500 mt-10">ไม่มีบิลค้างชำระ</p> : (
                    <div className="space-y-2">
                      {pendingOrders.map(order => (
                        <div key={order.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-2">
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{order.doc_no}</p>
                            <p className="text-[10px] text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                          </div>
                          <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                            <span className="font-black text-blue-600">฿{order.total_amount.toLocaleString()}</span>
                            <button onClick={() => { playBeep(); setSelectedPendingOrder(order); setPaymentMethod("cash"); setCashReceived(""); }} className="cursor-pointer bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-bold text-sm transition-colors">เลือก</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex flex-col h-full">
                    <button onClick={() => { playBeep(); setSelectedPendingOrder(null); }} className="cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-800 mb-3 self-start bg-gray-200 px-3 py-1 rounded-lg">← กลับหน้ารายการ</button>
                    
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm mb-3 text-center shrink-0">
                      <p className="text-gray-500 font-medium text-xs">เลขที่บิลที่เลือก</p>
                      <p className="text-base font-bold text-gray-800">{selectedPendingOrder.doc_no}</p>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-white p-3 rounded-xl border border-gray-200 shadow-sm mb-3">
                      <p className="font-bold text-gray-800 mb-2 border-b pb-1 text-sm">รายการสินค้า:</p>
                      <div className="space-y-2">
                        {selectedPendingOrder.order_items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <div>
                              <p className="font-bold text-gray-700">{item.qty} x {item.products?.name || "สินค้า"} {item.products?.is_vat_exempt && <span className="text-[9px] text-red-500">(V0)</span>}</p>
                              {item.remark && <p className="text-[10px] text-orange-500 bg-orange-50 inline-block px-1 mt-0.5 rounded">- {item.remark}</p>}
                            </div>
                            <p className="font-bold text-gray-800">฿{(item.unit_price * item.qty).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-blue-100 p-3 rounded-xl flex justify-between items-center text-blue-700 shrink-0">
                      <span className="font-bold text-sm">ยอดสุทธิ</span>
                      <span className="text-xl font-black">฿{selectedPendingOrder.total_amount.toLocaleString()}</span>
                    </div>

                    {selectedPendingOrder.slip_image && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 shrink-0">
                        <p className="text-xs font-bold text-gray-500 mb-2">หลักฐานการโอนเงิน (สลิป):</p>
                        <img src={selectedPendingOrder.slip_image} alt="Slip" className="w-full rounded-lg object-contain max-h-48" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={`w-full md:w-1/2 bg-white p-4 flex flex-col overflow-y-auto ${!selectedPendingOrder ? 'hidden md:flex opacity-30 pointer-events-none' : ''}`}>
                <label className="block text-sm font-bold text-gray-700 mb-2">รูปแบบการชำระเงิน</label>
                <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
                  <button onClick={() => { playBeep(); setPaymentMethod("cash"); }} className={`cursor-pointer py-3 rounded-xl font-bold border-2 text-base transition-all ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500"}`}>💵 เงินสด</button>
                  <button onClick={() => { playBeep(); setPaymentMethod("transfer"); }} className={`cursor-pointer py-3 rounded-xl font-bold border-2 text-base transition-all ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500"}`}>📱 โอนเงิน/QR</button>
                </div>

                <div className="flex-1 flex flex-col justify-center shrink-0 min-h-[150px]">
                  {paymentMethod === "transfer" && selectedPendingOrder && (
                    <div className="text-center p-4 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center">
                      {storeSettings?.promptpay_number ? (
                        <><div className="bg-white p-2 rounded-xl shadow-sm"><QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, selectedPendingOrder.total_amount)} size={140} /></div><p className="font-bold text-blue-800 mt-2 text-sm">สแกน QR Code</p></>
                      ) : <p className="text-red-500 font-bold">ไม่มีเบอร์ PromptPay</p>}
                    </div>
                  )}
                  {paymentMethod === "cash" && selectedPendingOrder && (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 shadow-inner">
                      <label className="block text-xs font-bold text-gray-500 mb-2 text-center uppercase">รับเงินสด (บาท)</label>
                      <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="w-full px-4 py-3 text-2xl font-black text-center text-blue-700 border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 bg-white" placeholder="0.00" />
                    </div>
                  )}
                </div>
                <button onClick={handlePayPendingOrder} disabled={isProcessing || !selectedPendingOrder} className="cursor-pointer mt-4 w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-lg shadow-lg active:scale-95 transition-all shrink-0">✅ ยืนยันรับเงิน</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {savedPendingReceipt && storeSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-4 bg-orange-500 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold text-lg">⏳ บันทึกค้างชำระสำเร็จ</h2>
              <button onClick={() => { playBeep(); setSavedPendingReceipt(null); }} className="cursor-pointer text-white font-bold text-xl">✕</button>
            </div>
            <div className="p-6 bg-white overflow-y-auto flex-1">
              <div className="text-center mb-4">
                <h1 className="font-black text-xl text-gray-800">{storeSettings.name}</h1>
                <p className="text-gray-500 text-xs mt-1">บิลค้างเลขที่: <span className="font-bold">{savedPendingReceipt.docNo}</span></p>
                <div className="mt-2 inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-bold text-xs">รอรับเงินหน้างาน</div>
              </div>
              <div className="space-y-2 mb-4 border-b border-dashed border-gray-300 pb-4 text-sm">
                {savedPendingReceipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start">
                    <span className="font-bold text-gray-800">{item.cart_qty} x {item.name}</span>
                    <span className="font-bold text-gray-800">฿{(item.price * item.cart_qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-black text-lg text-orange-600 bg-orange-50 p-3 rounded-xl shrink-0">
                <span>ยอดสุทธิรอชำระ</span><span>฿{savedPendingReceipt.totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t shrink-0">
              <button onClick={() => { playBeep(); setSavedPendingReceipt(null); }} className="cursor-pointer w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors">ตกลง / ปิด</button>
            </div>
          </div>
        </div>
      )}

      {receiptData && storeSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-4 bg-green-500 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold text-lg">✅ ชำระเงินเรียบร้อย</h2>
              <button onClick={() => { playBeep(); setReceiptData(null); }} className="cursor-pointer text-white font-bold text-xl">✕</button>
            </div>
            <div className="p-6 bg-white overflow-y-auto flex-1">
              <div className="text-center mb-4">
                <h1 className="font-black text-xl text-gray-800">{storeSettings.name}</h1>
                <p className="text-gray-500 text-xs mt-1">บิลเลขที่: <span className="font-bold">{receiptData.docNo}</span></p>
              </div>
              <div className="space-y-2 mb-4 border-b border-dashed border-gray-300 pb-4 text-sm">
                {receiptData.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-gray-800">{item.cart_qty} x {item.name} {item.is_vat_exempt && <span className="text-[10px] text-red-500">(V0)</span>}</span>
                      <span className="font-bold text-gray-800">฿{(item.price * item.cart_qty).toLocaleString()}</span>
                    </div>
                    {item.remark && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded mt-1 self-start">- {item.remark}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-black text-lg text-blue-600 bg-blue-50 p-3 rounded-xl mb-4 shrink-0">
                <span>ยอดสุทธิ</span><span>฿{receiptData.totalAmount.toLocaleString()}</span>
              </div>
              <div className="space-y-2 text-sm text-gray-700 shrink-0">
                <div className="flex justify-between">
                  <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'สด' : 'โอน'})</span>
                  <span className="font-bold">฿{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toLocaleString() : receiptData.totalAmount.toLocaleString()}</span>
                </div>
                {receiptData.changeAmount > 0 && (
                  <div className="flex justify-between font-bold text-green-600 text-base">
                    <span>เงินทอน</span><span>฿{receiptData.changeAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex gap-3 shrink-0">
              <button onClick={() => { playBeep(); setReceiptData(null); }} className="cursor-pointer flex-1 bg-white border text-gray-700 font-bold py-3.5 rounded-xl hover:bg-gray-100 transition-colors">ปิด</button>
              <button onClick={() => { playBeep(); window.print(); }} className="cursor-pointer flex-[2] bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-blue-700 transition-colors">🖨️ พิมพ์สลิป</button>
            </div>
          </div>
        </div>
      )}

      <div className="print-area">
        {showCheckout && !receiptData && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              {storeSettings?.logo_url && <img src={storeSettings.logo_url} alt="Logo" />}
              <h1 style={{ fontWeight: 'bold', fontSize: '13px', margin: 0 }}>{storeSettings?.name}</h1>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>{storeSettings?.address}</p>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>โทร: {storeSettings?.phone_number}</p>
              <p style={{ fontSize: '11px', margin: '4px 0', fontWeight: 'bold', borderBottom: '1px dashed #000', paddingBottom: '2px' }}>{storeSettings?.invoice_title || "ใบแจ้งหนี้"}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '9px' }}>
              <span>เลขที่: {tempInvoiceNo}</span>
              <span>วันที่: {new Date().toLocaleDateString('th-TH')}</span>
            </div>
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.name} {item.is_vat_exempt && "(V0)"}</span>
                    <span>{(item.price * item.cart_qty).toFixed(2)}</span>
                  </div>
                  {item.remark && <div style={{ fontSize: '8px', color: '#333' }}>- {item.remark}</div>}
                  <div style={{ fontSize: '8px' }}>{item.cart_qty} x {item.price.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px' }}>
              <span>ยอดที่ต้องชำระ</span><span>{totalAmount.toFixed(2)} ฿</span>
            </div>
            {storeSettings?.promptpay_number && paymentMethod === 'transfer' && (
              <div style={{ textAlign: 'center', marginTop: '6px' }}>
                <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={90} />
                <p style={{ fontSize: '8px', margin: '4px 0 0 0' }}>สแกนชำระผ่าน QR Code พร้อมเพย์</p>
                <p style={{ fontSize: '8px', margin: '2px 0 0 0' }}>กรุณาชำระเงินตามยอดดังกล่าว</p>
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '8px' }}>
              <p style={{ margin: 0 }}>{storeSettings?.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ"}</p>
              <p style={{ margin: '2px 0 0 0' }}>Powered by POS System</p>
            </div>
          </div>
        )}

        {receiptData && storeSettings && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              {storeSettings.logo_url && <img src={storeSettings.logo_url} alt="Logo" />}
              <h1 style={{ fontWeight: 'bold', fontSize: '13px', margin: 0 }}>{storeSettings.name}</h1>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>{storeSettings.address}</p>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>โทร: {storeSettings.phone_number}</p>
              <p style={{ margin: '2px 0', fontSize: '9px' }}>TAX ID: {storeSettings.tax_id}</p>
              <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '4px 0', borderBottom: '1px dashed #000', paddingBottom: '2px' }}>{storeSettings.receipt_title || "ใบเสร็จรับเงิน"}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '9px' }}>
              <span>เลขที่: {receiptData.docNo}</span>
              <span>วันที่: {receiptData.date.toLocaleString('th-TH')}</span>
            </div>
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>
              {receiptData.items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.name} {item.is_vat_exempt && "(V0)"}</span>
                    <span>{(item.price * item.cart_qty).toFixed(2)}</span>
                  </div>
                  {item.remark && <div style={{ fontSize: '8px', color: '#333' }}>- {item.remark}</div>}
                  <div style={{ fontSize: '8px' }}>{item.cart_qty} x {item.price.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>มูลค่ายกเว้นภาษี (VAT 0%)</span><span>{receiptData.totalExempt.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>มูลค่าสินค้าก่อน VAT</span><span>{receiptData.totalVatable.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span>{receiptData.vatAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', margin: '4px 0' }}>
              <span>ยอดสุทธิ</span><span>{receiptData.totalAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน'})</span><span>{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toFixed(2) : receiptData.totalAmount.toFixed(2)}</span>
            </div>
            {receiptData.changeAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>เงินทอน</span><span>{receiptData.changeAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '8px' }}>
              <p style={{ margin: 0 }}>{storeSettings.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ"}</p>
              <p style={{ margin: '2px 0 0 0' }}>Powered by POS System</p>
            </div>
          </div>
        )}
      </div>
    </> 
  );
} 