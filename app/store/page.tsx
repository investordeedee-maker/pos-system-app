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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [createdDocNo, setCreatedDocNo] = useState("");

  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        const { data: storeData, error: storeError } = await supabase.from("stores").select("*").limit(1).single();
        if (storeError) {
          console.error("ดึงข้อมูลร้านค้าล้มเหลว:", storeError);
          setLoading(false);
          return;
        }

        if (storeData) {
          setStoreSettings(storeData);
          // 🛠️ ปลดล็อคเงื่อนไขสต๊อก เพื่อให้ดึงสินค้าทั้งหมดมาแสดง (ถ้าหมดให้แสดงป้ายสินค้าหมด)
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        setSlipImage(dataUrl);
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

      const payload: OrderPayload = {
        store_id: storeSettings.id, doc_no: docNo, order_source: "ONLINE", status: "pending", 
        total_amount: totalAmount, payment_method: "transfer", customer_name: customerName, 
        customer_phone: customerPhone, delivery_address: finalDeliveryAddress,
      };
      if (slipImage) payload.slip_image = slipImage; 

      const { data: orderData, error: orderError } = await supabase.from("orders").insert([payload]).select().single();
      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.sell_price, remark: item.remark || "" }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsToInsert);
      
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const newBalance = item.stock_qty - item.cart_qty;
        
        await supabase.from("products").update({ stock_qty: newBalance }).eq("id", item.id);
        
        await supabase.from("inventory_transactions").insert([{
          store_id: storeSettings.id,
          product_id: item.id,
          transaction_type: "OUT",
          quantity: item.cart_qty,
          balance_after: newBalance,
          reference_doc: docNo,
          notes: "สั่งซื้อผ่านออนไลน์ (Online Store)"
        }]);
      }

      setOrderSuccess(true); setCart([]); setShowCheckout(false); setSlipImage(null);
    } catch (error: unknown) { 
      if (error instanceof Error) alert(`ข้อผิดพลาดฐานข้อมูล: ${error.message}`);
      else alert("เกิดข้อผิดพลาด");
    } finally { setIsSubmitting(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดเมนูร้านค้า...</div>;
  if (orderSuccess) return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gray-50 p-6 text-center">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full animate-fade-in-up">
        <span className="text-6xl mb-4 block">🎉</span>
        <h2 className="text-2xl font-black text-green-600 mb-2">สั่งซื้อสำเร็จ!</h2>
        <p className="text-gray-500 text-sm mb-2">เลขที่คำสั่งซื้อ: <span className="font-bold text-gray-800">{createdDocNo}</span></p>
        <p className="text-gray-600 mb-6">ทางร้านได้รับคำสั่งซื้อและสลิปของคุณเรียบร้อยแล้ว จะรีบดำเนินการจัดส่งให้ครับ</p>
        <button onClick={() => { setOrderSuccess(false); setStep("form"); }} className="cursor-pointer bg-blue-600 text-white font-bold py-3 px-8 rounded-full w-full hover:bg-blue-700 transition-all shadow-md">กลับสู่หน้าร้าน</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {storeSettings?.logo_url ? (
              <img src={storeSettings.logo_url} alt="Logo" className="w-12 h-12 rounded-full object-cover border shadow-sm" />
            ) : (
               <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xl">{storeSettings?.name ? storeSettings.name.charAt(0) : "S"}</div>
            )}
            <div><h1 className="font-black text-lg text-gray-800">{storeSettings?.name || "ร้านค้าออนไลน์"}</h1><p className="text-xs text-blue-600 font-bold">สั่งสะดวก ส่งตรงถึงหน้าบ้าน</p></div>
          </div>
          <button onClick={() => router.push("/")} className="cursor-pointer text-xs font-bold text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
            🏠 หน้าหลัก
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
             <span className="text-6xl mb-4 opacity-50 block">📦</span>
             <p className="text-xl font-bold">ยังไม่มีสินค้าจำหน่ายในขณะนี้</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map(product => (
              <div key={product.id} onClick={() => addToCart(product)} className={`bg-white rounded-2xl shadow-sm border ${product.stock_qty <= 0 ? 'border-gray-200 opacity-60' : 'border-gray-100 hover:border-blue-400 cursor-pointer'} overflow-hidden flex flex-col active:scale-95 transition-all group`}>
                <div className="relative aspect-square bg-gray-50 p-4 flex items-center justify-center">
                  {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-xl" /> : <div className="text-gray-300 text-4xl">No Image</div>}
                  {/* 🛠️ ป้ายกำกับถ้าสินค้าหมด */}
                  {product.stock_qty <= 0 && <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center"><span className="bg-red-600 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow-md">สินค้าหมด</span></div>}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-800 text-sm line-clamp-2 leading-snug">{product.name}</h3>
                  <div className="mt-auto pt-3 flex justify-between items-end">
                    <span className="font-black text-blue-600 text-lg">{product.sell_price.toLocaleString()} ฿</span>
                    <button disabled={product.stock_qty <= 0} className={`w-8 h-8 rounded-full font-bold flex items-center justify-center shadow-md transition-colors ${product.stock_qty <= 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white group-hover:bg-blue-700'}`}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {cart.length > 0 && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] z-20 animate-fade-in-up">
          <div className="max-w-3xl mx-auto p-4 flex justify-between items-center">
            <div><p className="text-xs text-gray-500 font-bold mb-1">ตะกร้าสินค้า ({cart.length} รายการ)</p><p className="text-2xl font-black text-blue-600">{totalAmount.toLocaleString()} ฿</p></div>
            <button onClick={() => { setShowCheckout(true); setStep("form"); }} className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-8 rounded-2xl shadow-lg shadow-blue-600/30 text-base active:scale-95 transition-all">ดูตะกร้าสินค้า →</button>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-white min-h-screen flex flex-col shadow-2xl">
            <header className="p-5 border-b border-gray-100 flex items-center sticky top-0 bg-white z-10 shadow-sm">
              <button onClick={() => setShowCheckout(false)} className="cursor-pointer w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full font-bold text-gray-600 mr-4 transition-colors">←</button>
              <h2 className="text-xl font-black text-gray-800">{step === "form" ? "ยืนยันคำสั่งซื้อ" : "ชำระเงิน"}</h2>
            </header>
            
            <div className="flex-1 p-5 pb-40">
              {step === "form" ? (
                <div className="animate-fade-in">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="text-blue-600">🛒</span> รายการสินค้า</h3>
                  <div className="space-y-3 mb-8">
                    {cart.map(item => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 pr-3"><h4 className="font-bold text-gray-800 leading-snug">{item.name}</h4><p className="font-black text-blue-600 mt-1">{item.sell_price.toLocaleString()} ฿</p></div>
                          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1 shrink-0">
                            <button onClick={() => updateQty(item.id, -1)} className="cursor-pointer font-black text-gray-500 w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm">-</button>
                            <span className="font-black w-8 text-center">{item.cart_qty}</span>
                            <button onClick={() => updateQty(item.id, 1)} className="cursor-pointer font-black text-blue-600 w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm">+</button>
                          </div>
                        </div>
                        <input type="text" placeholder="หมายเหตุ (เช่น หวานน้อย)..." value={item.remark} onChange={(e) => updateRemark(item.id, e.target.value)} className="w-full text-xs p-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors" />
                        <div className="text-right mt-2"><button onClick={() => removeFromCart(item.id)} className="cursor-pointer text-red-500 font-bold text-xs hover:underline">🗑️ ลบรายการนี้</button></div>
                      </div>
                    ))}
                  </div>

                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="text-blue-600">📍</span> ข้อมูลการจัดส่ง</h3>
                  <form id="order-form" onSubmit={handleProceedToPayment} className="space-y-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">ชื่อผู้รับ</label><input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" placeholder="ระบุชื่อผู้รับสินค้า" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">เบอร์โทรศัพท์</label><input required type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" placeholder="08X-XXX-XXXX" /></div>
                    
                    <div className="pt-2">
                      <label className="block text-xs font-bold text-gray-600 mb-1.5">ที่อยู่จัดส่ง (บ้านเลขที่, ถนน, ตำบล, จังหวัด)</label>
                      <textarea required value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" rows={3} placeholder="กรอกที่อยู่แบบละเอียด..." />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-bold text-gray-600">พิกัด GPS (เพื่อความแม่นยำ)</label>
                        <button type="button" onClick={handleGetLocation} className="cursor-pointer text-xs text-blue-700 font-bold bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow-sm">📍 ดึงตำแหน่งปัจจุบัน</button>
                      </div>
                      <input type="text" value={gpsLocation} onChange={e => setGpsLocation(e.target.value)} placeholder="คลิกปุ่ม หรือวางลิงก์ Google Maps" className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 focus:bg-white focus:border-blue-500 outline-none text-xs text-blue-600 transition-colors" />
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-6 animate-fade-in">
                  <div className="bg-blue-50 text-blue-700 font-bold px-6 py-2 rounded-full mb-6 border border-blue-100 shadow-sm">ยอดชำระสุทธิ: <span className="font-black text-xl ml-2">{totalAmount.toLocaleString()} ฿</span></div>
                  
                  {storeSettings?.promptpay_number ? (
                    <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-gray-100 mb-8">
                      <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={220} />
                      <p className="mt-4 text-xs font-bold text-gray-500">สแกนผ่านแอปธนาคารเพื่อโอนเงิน</p>
                    </div>
                  ) : <p className="text-red-500 text-sm mb-8 font-bold bg-red-50 p-4 rounded-xl">⚠️ ร้านค้านี้ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>}
                  
                  <div className="w-full max-w-sm bg-gray-50 border-2 border-dashed border-gray-300 p-6 rounded-3xl mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-3">อัปโหลดรูปสลิปโอนเงิน <span className="text-red-500">*</span></label>
                    <input type="file" accept="image/*" onChange={handleSlipUpload} className="cursor-pointer w-full text-xs file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all" />
                    {slipImage && <div className="mt-4 relative w-full h-48 border-2 border-gray-200 rounded-2xl overflow-hidden bg-white shadow-inner"><img src={slipImage} alt="Slip" className="w-full h-full object-contain" /></div>}
                  </div>
                </div>
              )}
            </div>
            
            <div className="fixed bottom-0 left-0 right-0 max-w-3xl mx-auto bg-white p-5 border-t border-gray-100 shadow-[0_-15px_30px_rgba(0,0,0,0.06)] z-20">
              <div className="flex justify-between items-end mb-4 bg-gray-50 px-4 py-3 rounded-xl border border-gray-200"><span className="font-bold text-gray-500 text-sm">ยอดรวมทั้งหมด</span><span className="text-3xl font-black text-blue-600 tracking-tighter">{totalAmount.toLocaleString()} ฿</span></div>
              {step === "form" ? (
                <button form="order-form" type="submit" className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-lg py-4 rounded-2xl shadow-[0_10px_20px_rgba(37,99,235,0.3)] transition-all active:scale-95">ชำระเงิน (QR Code) →</button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setStep("form")} className="cursor-pointer flex-[1] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-4 rounded-2xl transition-colors">← แก้ไข</button>
                  <button onClick={handleFinalSubmitOrder} disabled={isSubmitting || !slipImage} className="cursor-pointer flex-[2.5] bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-black text-lg py-4 rounded-2xl shadow-[0_10px_20px_rgba(34,197,94,0.3)] disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2">
                    {isSubmitting ? "⏳ กำลังส่งข้อมูล..." : "✅ ยืนยันการสั่งซื้อ"}
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