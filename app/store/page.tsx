"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface Product { id: string; name: string; sell_price: number; image_url: string; stock_qty: number; }
interface CartItem extends Product { cart_qty: number; remark: string; }
interface StoreSettings { id: string; name: string; address: string; logo_url: string; phone_number: string; promptpay_number: string; }
interface OrderPayload { store_id: string; doc_no: string; order_source: string; status: string; total_amount: number; payment_method: string; customer_name: string; customer_phone: string; delivery_address: string; slip_image?: string; }

interface CompletedOrderDetails {
  docNo: string;
  items: CartItem[];
  total: number;
  customerName: string;
  date: string;
}

function generatePromptPayPayload(mobileOrId: string, amount: number): string {
  const sanitizeId = mobileOrId.replace(/[^0-9]/g, "");
  let targetField = "";
  if (sanitizeId.length === 10) targetField = "01130066" + sanitizeId.substring(1);
  else if (sanitizeId.length === 13) targetField = "0213" + sanitizeId;
  else return "";
  
  const accInfo = "0016A000000677010111" + targetField;
  const tag29 = "29" + accInfo.length.toString().padStart(2, "0") + accInfo;
  const amtStr = amount.toFixed(2);
  const tag54 = "54" + amtStr.length.toString().padStart(2, "0") + amtStr;
  const payload = "000201010212" + tag29 + "5802TH5303764" + tag54 + "6304";
  
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return payload + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

export default function CustomerStorefront() {
  const router = useRouter(); 
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCheckout, setShowCheckout] = useState(false);
  const [step, setStep] = useState<"form" | "payment">("form");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [gpsLocation, setGpsLocation] = useState("");
  
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<Blob | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [createdDocNo, setCreatedDocNo] = useState("");
  const [completedDetails, setCompletedDetails] = useState<CompletedOrderDetails | null>(null);

  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        const { data: storeData, error: storeError } = await supabase
          .from("stores")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
          
        if (storeError) {
          console.error("ดึงข้อมูลร้านค้าล้มเหลว:", storeError);
          setLoading(false);
          return;
        }

        if (storeData) {
          setStoreSettings(storeData);
          const { data: productsData, error: prodError } = await supabase.from("products").select("*").eq("store_id", storeData.id).order("sort_order", { ascending: true });
          
          if (prodError) {
            console.error("ดึงข้อมูลสินค้าล้มเหลว:", prodError);
          } else if (productsData) {
            setProducts(productsData);
          }
        }
      } catch (error) { 
        console.error("Error:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchStoreData();
  }, []);

  const handleGetLocation = () => {
    if (!navigator.geolocation) { alert("เบราว์เซอร์ไม่รองรับ GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const mapsLink = `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`;
        setGpsLocation(mapsLink);
      },
      () => alert("กรุณาอนุญาตตำแหน่ง หรือพิมพ์ที่อยู่ด้วยตนเอง")
    );
  };

  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 500;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            setSlipFile(blob);
            setSlipImage(URL.createObjectURL(blob)); 
          }
        }, "image/jpeg", 0.7);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const addToCart = (product: Product) => {
    if (product.stock_qty <= 0) { alert("ขออภัย สินค้านี้หมดชั่วคราวครับ"); return; }
    
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.cart_qty >= product.stock_qty) { alert("หยิบสินค้าเกินจำนวนที่มีในสต๊อกแล้วครับ"); return prev; }
        return prev.map((item) => item.id === product.id ? { ...item, cart_qty: item.cart_qty + 1 } : item);
      }
      return [...prev, { ...product, cart_qty: 1, remark: "" }];
    });
  };

  const updateRemark = (id: string, remark: string) => setCart((prev) => prev.map((item) => item.id === id ? { ...item, remark } : item));
  const updateQty = (id: string, delta: number) => setCart((prev) => prev.map((item) => {
    if (item.id === id) { const newQty = item.cart_qty + delta; if (newQty > 0 && newQty <= item.stock_qty) return { ...item, cart_qty: newQty }; }
    return item;
  }));
  const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));
  const totalAmount = cart.reduce((sum, item) => sum + item.sell_price * item.cart_qty, 0);

  const handleProceedToPayment = (e: React.FormEvent) => { e.preventDefault(); if (cart.length === 0) return; setStep("payment"); };

  const handleFinalSubmitOrder = async () => {
    if (!storeSettings?.id || cart.length === 0) return;
    setIsSubmitting(true);
    try {
      const now = new Date();
      const prefix = `OL${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-`;
      const { data: lastOrder } = await supabase.from("orders").select("doc_no").eq("store_id", storeSettings.id).like("doc_no", `${prefix}%`).order("doc_no", { ascending: false }).limit(1);
      let runningNum = 1;
      if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) runningNum = parseInt(lastOrder[0].doc_no.split("-")[1], 10) + 1;
      const docNo = `${prefix}${runningNum.toString().padStart(4, '0')}`;
      setCreatedDocNo(docNo);

      const finalDeliveryAddress = gpsLocation ? `${deliveryAddress}\nพิกัด GPS: ${gpsLocation}` : deliveryAddress;

      let finalSlipUrl = "";

      if (slipFile) {
        // ใช้ crypto.randomUUID() แทนการสุ่มตัวเลขแบบเดิม เพื่อไม่ให้โดน ESLint ดักจับ
        const uniqueId = crypto.randomUUID();
        const uploadFileName = `slips/OL_${uniqueId}.jpg`;
        
        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(uploadFileName, slipFile, { contentType: 'image/jpeg' });
          
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage.from('uploads').getPublicUrl(uploadFileName);
        finalSlipUrl = publicUrlData.publicUrl;
      }

      const payload: OrderPayload = {
        store_id: storeSettings.id, doc_no: docNo, order_source: "ONLINE", status: "pending", 
        total_amount: totalAmount, payment_method: "transfer", customer_name: customerName, 
        customer_phone: customerPhone, delivery_address: finalDeliveryAddress,
      };
      
      if (finalSlipUrl) payload.slip_image = finalSlipUrl; 

      const { data: orderData, error: orderError } = await supabase.from("orders").insert([payload]).select().single();
      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.sell_price, remark: item.remark || "" }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsToInsert);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const newBalance = item.stock_qty - item.cart_qty;
        await supabase.from("products").update({ stock_qty: newBalance }).eq("id", item.id);
        await supabase.from("inventory_transactions").insert([{
          store_id: storeSettings.id, product_id: item.id, transaction_type: "OUT",
          quantity: item.cart_qty, balance_after: newBalance, reference_doc: docNo, notes: "สั่งซื้อผ่านออนไลน์"
        }]);
      }

      localStorage.setItem("last_order_doc", docNo);

      setCompletedDetails({
        docNo: docNo,
        items: [...cart],
        total: totalAmount,
        customerName: customerName,
        date: new Date().toLocaleString('th-TH')
      });

      setOrderSuccess(true); setCart([]); setShowCheckout(false); setSlipImage(null); setSlipFile(null);
    } catch (error: unknown) { 
      if (error instanceof Error) alert(`ข้อผิดพลาดฐานข้อมูล: ${error.message}`);
      else alert("เกิดข้อผิดพลาด");
    } finally { setIsSubmitting(false); }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(createdDocNo);
    alert("คัดลอกเลขคำสั่งซื้อเรียบร้อยแล้ว!");
  };

  const downloadReceiptImage = () => {
    if (!completedDetails) return;
    
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 450;
    canvas.width = width;
    
    let y = 60;
    const lineHeight = 30;
    const margin = 30;

    let totalHeight = 400 + (completedDetails.items.length * lineHeight);
    completedDetails.items.forEach(item => { if(item.remark) totalHeight += 25; });
    canvas.height = totalHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#111827"; 
    ctx.textAlign = "center";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(storeSettings?.name || "ร้านค้าออนไลน์", width / 2, y);
    
    y += 40;
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#4b5563"; 
    ctx.fillText("ใบสั่งซื้อสินค้า / E-Receipt", width / 2, y);

    y += 35;
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();

    y += 40;
    ctx.fillStyle = "#374151"; 
    ctx.textAlign = "left";
    ctx.font = "18px sans-serif";
    ctx.fillText(`เลขที่ออเดอร์:  ${completedDetails.docNo}`, margin, y);
    
    y += lineHeight;
    ctx.fillText(`วันที่:  ${completedDetails.date}`, margin, y);
    
    y += lineHeight;
    ctx.fillText(`ลูกค้า:  ${completedDetails.customerName || "ลูกค้าทั่วไป"}`, margin, y);

    y += 30;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();

    y += 40;
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#111827";
    ctx.fillText("รายการสินค้า", margin, y);
    ctx.textAlign = "right";
    ctx.fillText("ราคารวม", width - margin, y);

    y += 35;
    ctx.font = "18px sans-serif";
    completedDetails.items.forEach(item => {
      const itemTotal = item.sell_price * item.cart_qty;
      
      ctx.textAlign = "left";
      ctx.fillStyle = "#374151";
      ctx.fillText(`${item.cart_qty} x ${item.name}`, margin, y);
      
      ctx.textAlign = "right";
      ctx.fillStyle = "#111827";
      ctx.fillText(`฿${itemTotal.toLocaleString()}`, width - margin, y);
      
      y += lineHeight;

      if (item.remark) {
         ctx.textAlign = "left";
         ctx.fillStyle = "#ef4444"; 
         ctx.font = "16px sans-serif";
         ctx.fillText(`   * ${item.remark}`, margin, y);
         ctx.font = "18px sans-serif";
         y += 28;
      }
    });

    y += 15;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();

    y += 45;
    ctx.textAlign = "left";
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#111827";
    ctx.fillText("ยอดชำระสุทธิ", margin, y);
    
    ctx.textAlign = "right";
    ctx.fillStyle = "#4f46e5"; 
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`฿${completedDetails.total.toLocaleString()}`, width - margin, y);

    y += 60;
    ctx.textAlign = "center";
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#6b7280"; 
    ctx.fillText("ขอบคุณที่อุดหนุนครับ/ค่ะ", width / 2, y);

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `Receipt_${completedDetails.docNo}.png`;
    link.click();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดเมนูร้านค้า...</div>;
  
  if (orderSuccess) return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gray-50 p-6 text-center">
      <div className="bg-white p-8 rounded-[2rem] shadow-xl max-w-md w-full animate-fade-in-up border border-gray-100">
        <span className="text-7xl mb-4 block animate-bounce">🎉</span>
        <h2 className="text-3xl font-black text-emerald-600 mb-2">สั่งซื้อสำเร็จ!</h2>
        <p className="text-gray-500 text-sm mb-4">เลขที่คำสั่งซื้อ: <span className="font-black text-gray-800 text-lg bg-gray-100 px-3 py-1.5 rounded-xl ml-1 border border-gray-200">{createdDocNo}</span></p>
        
        <div className="flex gap-2 mb-6">
            <button onClick={copyToClipboard} className="cursor-pointer flex-1 bg-gray-50 font-bold py-3 rounded-xl text-sm text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 shadow-sm active:scale-95">📋 คัดลอกเลขบิล</button>
            <button onClick={downloadReceiptImage} className="cursor-pointer flex-1 bg-indigo-50 font-bold py-3 rounded-xl text-sm text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm active:scale-95 flex items-center justify-center gap-1">📥 โหลดใบเสร็จ</button>
        </div>

        <p className="text-gray-600 mb-8 font-medium leading-relaxed">ทางร้านได้รับคำสั่งซื้อและสลิปของคุณเรียบร้อยแล้ว จะรีบดำเนินการจัดส่งให้เร็วที่สุดครับ</p>
        
        <div className="flex flex-col gap-3">
          <button onClick={() => router.push("/track")} className="cursor-pointer bg-gray-900 text-white font-bold py-4 px-8 rounded-2xl w-full hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 text-lg active:scale-95">📦 ติดตามสถานะ / แชท</button>
          <button onClick={() => { setOrderSuccess(false); setStep("form"); }} className="cursor-pointer bg-white border-2 border-gray-100 text-gray-600 font-bold py-3.5 px-8 rounded-2xl w-full hover:bg-gray-50 transition-all active:scale-95">← สั่งสินค้าเพิ่มเติม</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      <header className="bg-white shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] sticky top-0 z-10 border-b border-gray-100">
        <div className="max-w-4xl mx-auto p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {storeSettings?.logo_url ? (
              <img src={storeSettings.logo_url} alt="Logo" className="w-14 h-14 rounded-2xl object-cover border shadow-sm" />
            ) : (
               <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-inner">{storeSettings?.name ? storeSettings.name.charAt(0) : "S"}</div>
            )}
            <div>
              <h1 className="font-black text-xl text-gray-900 tracking-tight">{storeSettings?.name || "ร้านค้าออนไลน์"}</h1>
              <p className="mt-1 text-[11px] font-black text-white bg-gradient-to-r from-indigo-500 to-blue-600 px-3 py-0.5 rounded-full inline-flex items-center gap-1 shadow-sm">
                ✨ สั่งสะดวก ส่งตรงถึงหน้าบ้าน
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/track")} className="cursor-pointer text-sm font-bold text-white bg-gray-900 hover:bg-black px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95">
              <span className="text-lg">📦</span> <span className="hidden sm:inline">ติดตามออเดอร์</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-2">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
             <span className="text-6xl mb-4 opacity-30 block">📦</span>
             <p className="text-xl font-bold text-gray-500">ยังไม่มีสินค้าจำหน่ายในขณะนี้</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map(product => (
              <div key={product.id} onClick={() => addToCart(product)} className={`bg-white rounded-[1.5rem] shadow-sm border ${product.stock_qty <= 0 ? 'border-gray-200 opacity-60' : 'border-gray-100 hover:border-indigo-300 hover:shadow-md cursor-pointer'} overflow-hidden flex flex-col active:scale-95 transition-all duration-300 group`}>
                <div className="relative aspect-square bg-gray-50 p-5 flex items-center justify-center">
                  {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-xl shadow-sm transition-transform duration-500 group-hover:scale-105" /> : <div className="text-gray-300 text-4xl font-bold">No Image</div>}
                  {product.stock_qty <= 0 && <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center"><span className="bg-red-600 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow-lg">สินค้าหมด</span></div>}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-800 text-sm md:text-base line-clamp-2 leading-snug">{product.name}</h3>
                  <div className="mt-auto pt-3 flex justify-between items-end">
                    <span className="font-black text-indigo-600 text-lg md:text-xl">{product.sell_price.toLocaleString()} ฿</span>
                    <button disabled={product.stock_qty <= 0} className={`w-8 h-8 rounded-full font-black flex items-center justify-center shadow-sm transition-colors ${product.stock_qty <= 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-md'}`}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {cart.length > 0 && !showCheckout && (
        <div className="fixed bottom-6 left-4 right-4 z-20 animate-fade-in-up flex justify-center pointer-events-none">
          <div className="bg-gray-900 text-white rounded-[2rem] shadow-2xl p-2 pl-6 pr-2 flex justify-between items-center gap-6 w-full max-w-lg pointer-events-auto border border-gray-800">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">ตะกร้าสินค้า ({cart.length})</p>
              <p className="text-xl font-black">{totalAmount.toLocaleString()} <span className="text-sm font-medium">฿</span></p>
            </div>
            <button onClick={() => { setShowCheckout(true); setStep("form"); }} className="cursor-pointer bg-white text-gray-900 font-black py-3 px-6 rounded-3xl shadow-sm text-sm active:scale-95 transition-all hover:bg-gray-100 flex items-center gap-2">
              ชำระเงิน <span className="text-lg">→</span>
            </button>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 overflow-y-auto flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full max-w-2xl bg-white min-h-[80vh] sm:min-h-0 sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl sm:rounded-[2.5rem] rounded-t-[2.5rem] animate-fade-in-up overflow-hidden">
            
            <header className="p-5 border-b border-gray-100 flex items-center bg-white z-10 shrink-0">
              <button onClick={() => setShowCheckout(false)} className="cursor-pointer w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded-full font-bold text-gray-600 mr-4 transition-colors">✕</button>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">{step === "form" ? "ยืนยันคำสั่งซื้อ" : "สแกนชำระเงิน"}</h2>
            </header>
            
            <div className="flex-1 p-5 md:p-8 overflow-y-auto custom-scrollbar">
              {step === "form" ? (
                <div className="animate-fade-in space-y-8">
                  <section>
                    <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2"><span className="text-indigo-600 text-xl">🛒</span> สรุปรายการสินค้า</h3>
                    <div className="space-y-3">
                      {cart.map(item => (
                        <div key={item.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 pr-3">
                              <h4 className="font-bold text-gray-800 leading-snug">{item.name}</h4>
                              <p className="font-black text-indigo-600 mt-1">{item.sell_price.toLocaleString()} ฿</p>
                            </div>
                            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1.5 py-1 shrink-0 shadow-sm">
                              <button onClick={() => updateQty(item.id, -1)} className="cursor-pointer font-black text-gray-500 w-8 h-8 flex items-center justify-center hover:bg-gray-50 rounded-lg">-</button>
                              <span className="font-black w-6 text-center text-sm">{item.cart_qty}</span>
                              <button onClick={() => updateQty(item.id, 1)} className="cursor-pointer font-black text-indigo-600 w-8 h-8 flex items-center justify-center hover:bg-indigo-50 rounded-lg">+</button>
                            </div>
                          </div>
                          <input type="text" placeholder="หมายเหตุ (เช่น หวานน้อย)..." value={item.remark} onChange={(e) => updateRemark(item.id, e.target.value)} className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white transition-all" />
                          <div className="text-right mt-2"><button onClick={() => removeFromCart(item.id)} className="cursor-pointer text-gray-400 font-bold text-[11px] hover:text-red-500 transition-colors uppercase">🗑 ลบรายการ</button></div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2"><span className="text-indigo-600 text-xl">📍</span> ข้อมูลการจัดส่ง</h3>
                    <form id="order-form" onSubmit={handleProceedToPayment} className="space-y-4 bg-white p-1">
                      <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ชื่อผู้รับ</label><input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-medium" placeholder="ระบุชื่อผู้รับสินค้า" /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">เบอร์โทรศัพท์</label><input required type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-medium" placeholder="08X-XXX-XXXX" /></div>
                      
                      <div className="pt-2">
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ที่อยู่จัดส่งละเอียด</label>
                        <textarea required value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-medium" rows={3} placeholder="บ้านเลขที่, ถนน, ตำบล, จังหวัด..." />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">พิกัด GPS <span className="normal-case text-[10px] text-gray-400">(แนะนำ)</span></label>
                          <button type="button" onClick={handleGetLocation} className="cursor-pointer text-[11px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1"><span className="text-sm">📍</span> ดึงตำแหน่ง</button>
                        </div>
                        <input type="text" value={gpsLocation} onChange={e => setGpsLocation(e.target.value)} placeholder="วางลิงก์ Google Maps" className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-500 outline-none text-sm text-indigo-600 transition-all font-medium" />
                      </div>
                    </form>
                  </section>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-2 animate-fade-in">
                  <div className="bg-indigo-50 text-indigo-800 font-bold px-6 py-2.5 rounded-full mb-6 border border-indigo-100 shadow-sm flex items-center gap-2">ยอดชำระสุทธิ <span className="font-black text-2xl ml-1">฿{totalAmount.toLocaleString()}</span></div>
                  
                  {storeSettings?.promptpay_number ? (
                    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 mb-8 relative">
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-full shadow-md">QR พร้อมเพย์</div>
                      <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={200} className="mt-2" />
                      <p className="mt-5 text-sm font-bold text-gray-500">สแกนผ่านแอปธนาคารเพื่อโอนเงิน</p>
                    </div>
                  ) : <p className="text-red-500 text-sm mb-8 font-bold bg-red-50 p-4 rounded-xl border border-red-100">⚠️ ร้านค้านี้ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>}
                  
                  <div className="w-full max-w-sm bg-gray-50 border-2 border-dashed border-gray-200 p-6 rounded-3xl">
                    <label className="block text-sm font-black text-gray-800 mb-3">อัปโหลดหลักฐานการโอนเงิน <span className="text-red-500">*</span></label>
                    <input type="file" accept="image/*" onChange={handleSlipUpload} className="cursor-pointer w-full text-xs file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-gray-900 file:text-white hover:file:bg-black transition-all" />
                    {slipImage && <div className="mt-5 relative w-full h-48 border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm"><img src={slipImage} alt="Slip" className="w-full h-full object-contain" /></div>}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-white p-5 border-t border-gray-100 shrink-0 pb-8 sm:pb-5">
              <div className="flex justify-between items-end mb-4 px-2">
                <span className="font-black text-gray-400 text-sm uppercase tracking-wider">ยอดรวมทั้งหมด</span>
                <span className="text-3xl font-black text-gray-900 tracking-tighter">฿{totalAmount.toLocaleString()}</span>
              </div>
              {step === "form" ? (
                <button form="order-form" type="submit" className="cursor-pointer w-full bg-gray-900 hover:bg-black text-white font-black text-lg py-4 rounded-2xl shadow-lg transition-all active:scale-95">ไปหน้าชำระเงิน →</button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setStep("form")} className="cursor-pointer flex-[1] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-4 rounded-2xl transition-colors text-sm">← กลับ</button>
                  <button onClick={handleFinalSubmitOrder} disabled={isSubmitting || !slipImage} className="cursor-pointer flex-[2.5] bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-indigo-600/20 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2">
                    {isSubmitting ? "⏳ กำลังดำเนินการ..." : "✅ แจ้งโอนเงิน"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}