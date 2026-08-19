"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface Product {
  id: string; name: string; price: number; sell_price: number;
  stock_qty: number; is_vat_exempt: boolean; image_url: string;
}

interface CartItem extends Product { cart_qty: number; remark?: string; }

interface StoreSettings {
  id: string; name: string; address: string; logo_url: string;
  promptpay_number: string; phone_number: string; receipt_title: string;
  invoice_title: string; tax_id: string; receipt_footer: string;
}

interface ReceiptData {
  docNo: string; items: CartItem[]; totalAmount: number; totalExempt: number;
  totalVatable: number; vatAmount: number; paymentMethod: string;
  cashReceived: number | ""; changeAmount: number; date: Date;
}

interface PendingOrderItem {
  product_id: string; unit_price: number; qty: number; remark?: string;
  products?: { name: string; is_vat_exempt: boolean; };
}

interface PendingOrder {
  id: string; doc_no: string; created_at: string; total_amount: number;
  order_items: PendingOrderItem[];
}

function generatePromptPayPayload(mobileOrId: string, amount: number): string {
  const cleanId = mobileOrId.replace(/[^0-9]/g, "");
  let targetField = "";
  if (cleanId.length === 10) {
    const formattedMobile = "0066" + cleanId.substring(1);
    targetField = "0066" + formattedMobile.length.toString().padStart(2, "0") + formattedMobile;
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
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  return payloadWithoutCrc + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

const playBeep = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch { 
    // Ignore error
  }
};

export default function POSPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [cashReceived, setCashReceived] = useState<number | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<PendingOrder | null>(null);

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
      } catch { 
        // Ignore error
      } finally { 
        if (isMounted) setLoading(false); 
      }
    };
    initPOS();
    return () => { isMounted = false; };
  }, [router]);

  const addToCart = (product: Product) => {
    playBeep();
    if (product.stock_qty <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.cart_qty >= product.stock_qty) return prev;
        return prev.map((item) => item.id === product.id ? { ...item, cart_qty: item.cart_qty + 1 } : item);
      }
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
  const changeAmount = paymentMethod === "cash" && typeof cashReceived === "number" ? cashReceived - totalAmount : 0;
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const loadPendingOrders = async () => {
    playBeep();
    if (!storeSettings?.id) return;
    try {
      const { data, error } = await supabase.from("orders").select(`*, order_items(*, products(*))`).eq("store_id", storeSettings.id).eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      setPendingOrders(data || []);
      setShowPendingModal(true);
    } catch {
       // Ignore error
    }
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

      const { data: orderData, error: orderError } = await supabase.from("orders").insert([{ store_id: storeSettings.id, doc_no: docNo, order_source: "POS", status: "pending", total_amount: totalAmount, payment_method: "cash" }]).select().single();
      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.price, remark: item.remark || "" }));
      await supabase.from("order_items").insert(orderItemsToInsert);

      for (const item of cart) await supabase.from("products").update({ stock_qty: item.stock_qty - item.cart_qty }).eq("id", item.id);
      setProducts(prev => prev.map(p => { const sold = cart.find(c => c.id === p.id); return sold ? { ...p, stock_qty: p.stock_qty - sold.cart_qty } : p; }));

      setCart([]);
      setShowCheckout(false);
      setIsMobileCartOpen(false);
    } catch {
      // Ignore error
    } finally { 
      setIsProcessing(false); 
    }
  };

  const handleConfirmPayment = async () => {
    playBeep();
    if (!storeSettings?.id || cart.length === 0) return;
    
    const finalCashReceived = cashReceived;
    if (paymentMethod === "cash" && (typeof finalCashReceived !== "number" || finalCashReceived < totalAmount)) {
      alert("กรุณาระบุจำนวนเงินรับให้ครบถ้วนก่อนกดยืนยัน");
      return;
    }

    setIsProcessing(true);
    try {
      const now = new Date();
      const prefix = `IV${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-`;
      const { data: lastOrder } = await supabase.from("orders").select("doc_no").eq("store_id", storeSettings.id).like("doc_no", `${prefix}%`).order("doc_no", { ascending: false }).limit(1);
      let runningNum = 1;
      if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) runningNum = parseInt(lastOrder[0].doc_no.split("-")[1], 10) + 1;
      const docNo = `${prefix}${runningNum.toString().padStart(4, '0')}`;

      const { data: orderData, error: orderError } = await supabase.from("orders").insert([{ store_id: storeSettings.id, doc_no: docNo, order_source: "POS", status: "completed", total_amount: totalAmount, payment_method: paymentMethod }]).select().single();
      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.price, remark: item.remark || "" }));
      await supabase.from("order_items").insert(orderItemsToInsert);

      for (const item of cart) await supabase.from("products").update({ stock_qty: item.stock_qty - item.cart_qty }).eq("id", item.id);
      setProducts(prev => prev.map(p => { const sold = cart.find(c => c.id === p.id); return sold ? { ...p, stock_qty: p.stock_qty - sold.cart_qty } : p; }));

      setReceiptData({ docNo, items: cart, totalAmount, totalExempt, totalVatable, vatAmount, paymentMethod, cashReceived: finalCashReceived, changeAmount, date: now });
      setCart([]); setShowCheckout(false); setIsMobileCartOpen(false); setCashReceived("");
    } catch {
       // Ignore error
    } finally { 
      setIsProcessing(false); 
    }
  };

  const handlePayPendingOrder = async () => {
    playBeep();
    if (!selectedPendingOrder) return;
    const orderTotal = selectedPendingOrder.total_amount;
    
    const finalCashReceived = cashReceived;
    if (paymentMethod === "cash" && (typeof finalCashReceived !== "number" || finalCashReceived < orderTotal)) {
      alert("กรุณาระบุจำนวนเงินรับให้ครบถ้วน");
      return;
    }

    setIsProcessing(true);
    try {
      await supabase.from("orders").update({ status: "completed", payment_method: paymentMethod }).eq("id", selectedPendingOrder.id);
      const mappedItems: CartItem[] = selectedPendingOrder.order_items.map((oi: PendingOrderItem) => ({ id: oi.product_id, name: oi.products?.name || "สินค้า", price: oi.unit_price, cart_qty: oi.qty, is_vat_exempt: oi.products?.is_vat_exempt || false, remark: oi.remark || "", stock_qty: 0, sell_price: 0, image_url: "" }));
      const tExempt = mappedItems.filter(item => item.is_vat_exempt).reduce((sum, item) => sum + item.price * item.cart_qty, 0);
      const gVatable = selectedPendingOrder.total_amount - tExempt;
      const tVatable = gVatable / 1.07;
      const vAmount = gVatable - tVatable;
      const cAmount = paymentMethod === "cash" && typeof finalCashReceived === "number" ? finalCashReceived - selectedPendingOrder.total_amount : 0;

      setReceiptData({ docNo: selectedPendingOrder.doc_no, items: mappedItems, totalAmount: selectedPendingOrder.total_amount, totalExempt: tExempt, totalVatable: tVatable, vatAmount: vAmount, paymentMethod, cashReceived: finalCashReceived, changeAmount: cAmount, date: new Date() });
      setSelectedPendingOrder(null); setShowPendingModal(false); setCashReceived("");
    } catch {
       // Ignore error
    } finally { 
      setIsProcessing(false); 
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดระบบ POS...</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        .print-only { display: none; }
        @media print {
          @page { margin: 0; size: 58mm auto; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { 
            display: block !important; 
            position: absolute; 
            left: 0; top: 0; 
            width: 58mm; 
            padding: 2mm; 
            color: #000; 
            font-family: sans-serif; 
          }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="flex flex-col h-screen bg-gray-100 font-sans relative no-print pb-24 md:pb-0">
        <header className="bg-white shadow-sm px-4 py-3 flex flex-wrap items-center justify-between z-10 sticky top-0">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              {storeSettings?.logo_url ? (
                <div className="w-10 h-10 relative rounded-md overflow-hidden bg-white border border-gray-100">
                  <img src={storeSettings.logo_url} alt="Logo" className="w-full h-full object-contain p-1" crossOrigin="anonymous" />
                </div>
              ) : <div className="w-10 h-10 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-lg">{storeSettings?.name ? storeSettings.name.charAt(0) : "S"}</div>}
              <h1 className="text-xl font-black text-gray-800 tracking-tight hidden sm:block">{storeSettings?.name || "Standard POS"}</h1>
            </div>
            <button onClick={() => { playBeep(); router.push("/"); }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs md:text-sm border border-gray-200 active:scale-95">🏠 หน้าหลัก</button>
          </div>
          <div className="flex w-full md:w-auto gap-2 mt-3 md:mt-0 overflow-x-auto pb-1 md:pb-0">
            <input type="text" placeholder="ค้นหาสินค้า..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg w-full md:w-48 outline-none bg-gray-50 text-sm focus:border-blue-400 focus:bg-white flex-shrink-0" />
            <button onClick={loadPendingOrders} className="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg font-bold shadow-sm text-sm flex-shrink-0">🧾 บิลค้าง</button>
            <button onClick={() => { playBeep(); router.push("/products"); }} className="bg-gray-800 text-white px-3 py-2 rounded-lg font-bold shadow-md text-sm flex-shrink-0">📦 คลัง</button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            {products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="font-medium text-lg">ยังไม่มีสินค้าในร้าน</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-10">
                {filteredProducts.map((product) => (
                  <div key={product.id} onClick={() => addToCart(product)} className={`bg-white p-3 rounded-2xl shadow-sm border ${product.stock_qty <= 0 ? 'border-red-200 opacity-60' : 'border-gray-100 hover:border-blue-400 cursor-pointer'} flex flex-col active:scale-95`}>
                    <div className="w-full aspect-square bg-gray-50 rounded-xl mb-2 flex items-center justify-center relative overflow-hidden border border-gray-100 p-1">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" crossOrigin="anonymous" />
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

          <div className={`${isMobileCartOpen ? "fixed inset-0 z-50 flex" : "hidden"} md:flex w-full md:w-[350px] lg:w-[400px] flex-col bg-gray-900/50 md:bg-white md:shadow-2xl md:border-l border-gray-200`}>
            <div className="bg-white w-full h-full md:h-auto flex flex-col mt-auto md:mt-0 rounded-t-3xl md:rounded-none overflow-hidden">
              <div className="p-3 bg-gray-900 text-white flex justify-between items-center rounded-t-3xl md:rounded-none">
                <h2 className="text-sm font-bold flex items-center gap-2">🛒 ตะกร้า <span className="bg-blue-500 px-2 py-0.5 rounded-full">{totalItems}</span></h2>
                <div className="flex gap-2">
                  <button onClick={() => { playBeep(); setCart([]); }} className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded">ล้างทั้งหมด</button>
                  <button className="md:hidden text-white font-bold px-2" onClick={() => { playBeep(); setIsMobileCartOpen(false); }}>✕</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50/50">
                {cart.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 text-sm">ยังไม่ได้เลือกสินค้า</div> : 
                  cart.map((item) => (
                    <div key={item.id} className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex-1 pr-1">
                          <h4 className="text-xs font-bold text-gray-800 line-clamp-1">{item.name}</h4>
                          <div className="text-xs font-bold text-blue-600">฿{item.price.toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-1 bg-gray-50 px-1 rounded-lg border border-gray-100">
                          <button onClick={() => decreaseQuantity(item.id)} className="w-5 h-5 bg-white rounded shadow-sm font-bold text-gray-600">-</button>
                          <span className="font-bold text-xs w-4 text-center">{item.cart_qty}</span>
                          <button onClick={() => addToCart(item)} className="w-5 h-5 bg-blue-600 rounded text-white shadow-sm font-bold">+</button>
                          <button onClick={() => removeFromCart(item.id)} className="w-5 h-5 bg-red-100 rounded text-red-500 shadow-sm font-bold ml-1">✕</button>
                        </div>
                      </div>
                      <input type="text" placeholder="หมายเหตุ (เช่น หวานน้อย)..." value={item.remark || ""} onChange={(e) => updateRemark(item.id, e.target.value)} className="w-full text-[11px] px-2 py-1 border border-gray-200 rounded outline-none bg-gray-50" />
                    </div>
                  ))
                }
              </div>
              <div className="p-3 bg-white border-t border-gray-100">
                <div className="flex justify-between items-end mb-3">
                  <span className="text-gray-500 font-bold text-sm">ยอดรวม</span>
                  <span className="text-2xl font-black text-blue-600">฿{totalAmount.toLocaleString()}</span>
                </div>
                <button onClick={() => { playBeep(); setPaymentMethod("cash"); setCashReceived(""); setShowCheckout(true); }} disabled={cart.length === 0} className={`w-full py-3 rounded-xl font-bold text-base transition-all ${cart.length > 0 ? "bg-blue-600 text-white shadow-lg" : "bg-gray-200 text-gray-400"}`}>
                  ดำเนินการชำระเงิน
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCheckout && storeSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-auto max-h-[90vh]">
            
            <div className="w-full md:w-1/2 bg-gray-50 p-6 flex flex-col border-r border-gray-200 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-800">สรุปใบแจ้งหนี้</h2>
                <button onClick={() => { playBeep(); setShowCheckout(false); }} className="md:hidden text-gray-500 font-bold text-2xl w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">✕</button>
              </div>
              <div className="space-y-3 border-b border-dashed border-gray-300 pb-4 mb-4 flex-1">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex flex-col text-sm text-gray-700 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-start">
                      <span className="font-bold">{item.cart_qty} x {item.name}</span>
                      <span className="font-black text-blue-600">฿{(item.price * item.cart_qty).toLocaleString()}</span>
                    </div>
                    {item.remark && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded mt-2 self-start">- หมายเหตุ: {item.remark}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-2xl font-black text-blue-600 bg-blue-100 p-4 rounded-xl">
                <span>ยอดที่ต้องชำระ</span><span>฿{totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="w-full md:w-1/2 bg-white p-6 flex flex-col">
              <div className="hidden md:flex justify-end mb-2">
                <button onClick={() => { playBeep(); setShowCheckout(false); }} className="text-gray-400 hover:text-red-500 font-bold text-2xl">✕</button>
              </div>
              
              <label className="block text-sm font-bold text-gray-700 mb-3">รูปแบบการชำระเงิน</label>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button onClick={() => { playBeep(); setPaymentMethod("cash"); }} className={`py-4 rounded-xl font-bold border-2 text-lg transition-all ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>💵 เงินสด</button>
                <button onClick={() => { playBeep(); setPaymentMethod("transfer"); }} className={`py-4 rounded-xl font-bold border-2 text-lg transition-all ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>📱 โอนเงิน/QR</button>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {paymentMethod === "transfer" && (
                  <div className="text-center p-6 bg-blue-50 rounded-2xl border border-blue-100 shadow-inner flex flex-col items-center justify-center">
                    {storeSettings.promptpay_number ? (
                      <>
                        <div className="bg-white p-3 rounded-xl shadow-md"><QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={180} /></div>
                        <p className="font-bold text-blue-800 mt-4">สแกน QR Code เพื่อโอนเงิน</p>
                      </>
                    ) : <p className="text-red-500 font-bold">กรุณาตั้งค่าเบอร์ PromptPay ก่อน</p>}
                  </div>
                )}
                {paymentMethod === "cash" && (
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-inner">
                    <label className="block text-sm font-bold text-gray-500 mb-3 text-center uppercase tracking-wider">ระบุจำนวนเงินที่รับจากลูกค้า (บาท)</label>
                    <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-4 text-3xl font-black text-center text-blue-700 border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 transition-all bg-white shadow-sm" placeholder="0.00" />
                    {changeAmount > 0 && (
                      <div className="mt-4 flex justify-between items-center text-xl bg-green-100 border border-green-300 text-green-800 p-4 rounded-xl font-black shadow-sm">
                        <span>เงินทอน</span><span className="text-3xl">฿{changeAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button onClick={() => { playBeep(); window.print(); }} className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-4 rounded-xl flex-1 text-sm border border-gray-300 shadow-sm flex items-center justify-center gap-2">🖨️ แจ้งหนี้</button>
                  <button onClick={handleSavePendingOrder} disabled={isProcessing} className="bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold py-4 rounded-xl flex-1 text-sm border border-orange-200 shadow-sm flex items-center justify-center gap-2">⏳ บันทึกค้างชำระ</button>
                </div>
                <button onClick={handleConfirmPayment} disabled={isProcessing} className="w-full py-5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                  ✅ ยืนยันชำระเงิน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPendingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-auto max-h-[90vh]">
            <div className="w-full md:w-1/2 bg-gray-50 p-6 flex flex-col border-r border-gray-200 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-orange-600">🧾 รายการบิลค้างชำระ</h2>
                <button onClick={() => { playBeep(); setShowPendingModal(false); setSelectedPendingOrder(null); }} className="md:hidden text-gray-500 font-bold text-2xl w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">✕</button>
              </div>
              {!selectedPendingOrder ? (
                pendingOrders.length === 0 ? <p className="text-center text-gray-500 mt-10">ไม่มีบิลค้างชำระ</p> : (
                  <div className="space-y-3">
                    {pendingOrders.map(order => (
                      <div key={order.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
                        <div>
                          <p className="font-bold text-gray-800">{order.doc_no}</p>
                          <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                          <span className="font-black text-blue-600">฿{order.total_amount.toLocaleString()}</span>
                          <button onClick={() => { playBeep(); setSelectedPendingOrder(order); setPaymentMethod("cash"); setCashReceived(""); }} className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-bold text-sm">เลือก</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex flex-col h-full">
                  <button onClick={() => { playBeep(); setSelectedPendingOrder(null); }} className="text-sm font-bold text-gray-500 hover:text-gray-800 mb-4 self-start">← ย้อนกลับ</button>
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center flex-1 flex flex-col justify-center">
                    <p className="text-gray-500 font-medium">เลขที่บิลที่เลือก</p>
                    <p className="text-lg font-bold text-gray-800 mb-2">{selectedPendingOrder.doc_no}</p>
                    <h3 className="text-4xl font-black text-blue-600 mt-2">฿{selectedPendingOrder.total_amount.toLocaleString()}</h3>
                  </div>
                </div>
              )}
            </div>

            <div className={`w-full md:w-1/2 bg-white p-6 flex flex-col ${!selectedPendingOrder ? 'hidden md:flex opacity-50 pointer-events-none' : ''}`}>
              <div className="hidden md:flex justify-end mb-2">
                <button onClick={() => { playBeep(); setShowPendingModal(false); setSelectedPendingOrder(null); }} className="text-gray-400 hover:text-red-500 font-bold text-2xl">✕</button>
              </div>
              <label className="block text-sm font-bold text-gray-700 mb-3">รูปแบบการชำระเงิน</label>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button onClick={() => { playBeep(); setPaymentMethod("cash"); }} className={`py-4 rounded-xl font-bold border-2 text-lg transition-all ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500"}`}>💵 เงินสด</button>
                <button onClick={() => { playBeep(); setPaymentMethod("transfer"); }} className={`py-4 rounded-xl font-bold border-2 text-lg transition-all ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" : "border-gray-200 text-gray-500"}`}>📱 โอนเงิน/QR</button>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {paymentMethod === "transfer" && selectedPendingOrder && (
                  <div className="text-center p-6 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center">
                    {storeSettings?.promptpay_number ? (
                      <><div className="bg-white p-3 rounded-xl">
                        <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, selectedPendingOrder.total_amount)} size={180} />
                        </div><p className="font-bold text-blue-800 mt-4">สแกน QR Code</p></>
                    ) : <p className="text-red-500 font-bold">ไม่มีเบอร์ PromptPay</p>}
                  </div>
                )}
                {paymentMethod === "cash" && selectedPendingOrder && (
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-inner">
                    <label className="block text-sm font-bold text-gray-500 mb-3 text-center uppercase">รับเงินสด (บาท)</label>
                    <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-4 text-3xl font-black text-center text-blue-700 border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 bg-white" placeholder="0.00" />
                  </div>
                )}
              </div>
              <button onClick={handlePayPendingOrder} disabled={isProcessing || !selectedPendingOrder} className="mt-6 w-full py-5 bg-green-600 text-white rounded-xl font-black text-lg shadow-lg active:scale-95">✅ ยืนยันรับเงิน</button>
            </div>
          </div>
        </div>
      )}

      {receiptData && storeSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-green-500 text-white flex justify-between items-center">
              <h2 className="font-bold text-lg">✅ ชำระเงินเรียบร้อย</h2>
              <button onClick={() => { playBeep(); setReceiptData(null); }} className="text-white font-bold text-xl">✕</button>
            </div>
            <div className="p-6 bg-white overflow-y-auto max-h-[60vh]">
              <div className="text-center mb-4">
                <h1 className="font-black text-xl text-gray-800">{storeSettings.name}</h1>
                <p className="text-gray-500 text-xs mt-1">บิลเลขที่: <span className="font-bold">{receiptData.docNo}</span></p>
              </div>
              <div className="space-y-2 mb-4 border-b border-dashed border-gray-300 pb-4 text-sm">
                {receiptData.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-gray-800">{item.cart_qty} x {item.name}</span>
                      <span className="font-bold text-gray-800">฿{(item.price * item.cart_qty).toLocaleString()}</span>
                    </div>
                    {item.remark && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded mt-1 self-start">- {item.remark}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-black text-lg text-blue-600 bg-blue-50 p-3 rounded-xl mb-4">
                <span>ยอดสุทธิ</span><span>฿{receiptData.totalAmount.toLocaleString()}</span>
              </div>
              <div className="space-y-2 text-sm text-gray-700">
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
            <div className="p-4 bg-gray-50 border-t flex gap-3">
              <button onClick={() => { playBeep(); setReceiptData(null); }} className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-3.5 rounded-xl">ปิด</button>
              <button onClick={() => { playBeep(); window.print(); }} className="flex-[2] bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md">🖨️ พิมพ์สลิป (58mm)</button>
            </div>
          </div>
        </div>
      )}

      <div className="print-only">
        {showCheckout && !receiptData && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              {storeSettings?.logo_url && <img src={storeSettings.logo_url} alt="Logo" style={{ maxWidth: '40px', margin: '0 auto 4px auto', display: 'block' }} crossOrigin="anonymous" />}
              <h1 style={{ fontWeight: 'bold', fontSize: '14px', margin: 0 }}>{storeSettings?.name}</h1>
              <p style={{ fontSize: '10px', margin: '2px 0', fontWeight: 'bold' }}>{storeSettings?.invoice_title || "ใบแจ้งหนี้"}</p>
            </div>
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px', fontSize: '10px' }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.cart_qty} x {item.name}</span>
                    <span>{(item.price * item.cart_qty).toFixed(2)}</span>
                  </div>
                  {item.remark && <span style={{ fontSize: '8px', color: '#555', fontStyle: 'italic' }}>- {item.remark}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
              <span>ยอดต้องชำระ</span><span>{totalAmount.toFixed(2)}</span>
            </div>
            {storeSettings?.promptpay_number && (
              <div style={{ textAlign: 'center', marginTop: '6px' }}>
                <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={90} />
                <p style={{ fontSize: '8px', margin: '4px 0 0 0' }}>สแกนเพื่อชำระเงิน</p>
              </div>
            )}
          </div>
        )}

        {receiptData && storeSettings && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              {storeSettings.logo_url && <img src={storeSettings.logo_url} alt="Logo" style={{ maxWidth: '40px', margin: '0 auto 4px auto', display: 'block' }} crossOrigin="anonymous" />}
              <h1 style={{ fontWeight: 'bold', fontSize: '14px', margin: 0 }}>{storeSettings.name}</h1>
              <p style={{ fontSize: '8px', margin: '2px 0' }}>TAX ID: {storeSettings.tax_id}</p>
              <p style={{ fontSize: '10px', fontWeight: 'bold', margin: '2px 0' }}>{storeSettings.receipt_title || "ใบเสร็จรับเงิน"}</p>
              <p style={{ fontSize: '8px', margin: '2px 0' }}>บิล: {receiptData.docNo}</p>
            </div>
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px', fontSize: '10px' }}>
              {receiptData.items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.cart_qty} x {item.name}</span>
                    <span>{(item.price * item.cart_qty).toFixed(2)}</span>
                  </div>
                  {item.remark && <span style={{ fontSize: '8px', color: '#555', fontStyle: 'italic' }}>- {item.remark}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>VAT 7%</span><span>{receiptData.vatAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', margin: '4px 0' }}>
              <span>ยอดสุทธิ</span><span>{receiptData.totalAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
              <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'สด' : 'โอน'})</span><span>{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toFixed(2) : receiptData.totalAmount.toFixed(2)}</span>
            </div>
            {receiptData.changeAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '9px' }}>
                <span>เงินทอน</span><span>{receiptData.changeAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ textAlign: 'center', fontSize: '8px', marginTop: '6px' }}>
              <p style={{ margin: 0 }}>{storeSettings.receipt_footer || "ขอบคุณที่ใช้บริการ"}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}