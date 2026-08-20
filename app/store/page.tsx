"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import Image from "next/image";
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
  const router = useRouter(); // 🛠️ เพิ่ม Router สำหรับปุ่มกลับ Home
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCheckout, setShowCheckout] = useState(false);
  const [step, setStep] = useState<"form" | "payment">("form");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [createdDocNo, setCreatedDocNo] = useState("");

  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        const { data: storeData } = await supabase.from("stores").select("*").limit(1).single();
        if (storeData) {
          setStoreSettings(storeData);
          const { data: productsData } = await supabase.from("products").select("*").eq("store_id", storeData.id).gt("stock_qty", 0).order("sort_order", { ascending: true });
          if (productsData) setProducts(productsData);
        }
      } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
    };
    fetchStoreData();
  }, []);

  const handleGetLocation = () => {
    if (!navigator.geolocation) { alert("เบราว์เซอร์ไม่รองรับ GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const mapsLink = `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`;
        setDeliveryAddress((prev) => prev ? `${prev} \nพิกัด GPS: ${mapsLink}` : `พิกัด GPS: ${mapsLink}`);
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
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.cart_qty >= product.stock_qty) { alert("สินค้ามีจำกัด"); return prev; }
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

      const payload: OrderPayload = {
        store_id: storeSettings.id, doc_no: docNo, order_source: "ONLINE", status: "pending", 
        total_amount: totalAmount, payment_method: "transfer", customer_name: customerName, 
        customer_phone: customerPhone, delivery_address: deliveryAddress,
      };
      if (slipImage) payload.slip_image = slipImage; 

      const { data: orderData, error: orderError } = await supabase.from("orders").insert([payload]).select().single();
      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({ order_id: orderData.id, product_id: item.id, qty: item.cart_qty, unit_price: item.sell_price, remark: item.remark || "" }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsToInsert);
      
      if (itemsError) throw itemsError;

      for (const item of cart) await supabase.from("products").update({ stock_qty: item.stock_qty - item.cart_qty }).eq("id", item.id);

      setOrderSuccess(true); setCart([]); setShowCheckout(false); setSlipImage(null);
    } catch (error: unknown) { 
      if (error instanceof Error) alert(`ข้อผิดพลาดฐานข้อมูล: ${error.message}`);
      else alert("เกิดข้อผิดพลาด");
    } finally { setIsSubmitting(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดเมนูร้านค้า...</div>;
  if (orderSuccess) return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gray-50 p-6 text-center">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
        <span className="text-6xl mb-4 block">🎉</span>
        <h2 className="text-2xl font-black text-green-600 mb-2">สั่งซื้อสำเร็จ!</h2>
        <p className="text-gray-500 text-sm mb-2">เลขที่คำสั่งซื้อ: <span className="font-bold text-gray-800">{createdDocNo}</span></p>
        <p className="text-gray-600 mb-6">ทางร้านได้รับคำสั่งซื้อและสลิปของคุณเรียบร้อยแล้ว จะรีบดำเนินการจัดส่งให้ครับ</p>
        <button onClick={() => { setOrderSuccess(false); setStep("form"); }} className="cursor-pointer bg-blue-600 text-white font-bold py-3 px-8 rounded-full w-full hover:bg-blue-700 transition-all shadow-md">กลับสู่หน้าร้าน</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 pb-32 font-sans">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {storeSettings?.logo_url && <Image src={storeSettings.logo_url} alt="Logo" width={45} height={45} className="rounded-full object-cover border" />}
            <div><h1 className="font-black text-lg text-gray-800">{storeSettings?.name || "ร้านค้าออนไลน์"}</h1><p className="text-xs text-gray-500">สั่งสะดวก ส่งตรงถึงหน้าบ้าน</p></div>
          </div>
          {/* 🛠️ เพิ่มปุ่มกลับหน้า Home สำหรับแอดมิน */}
          <button onClick={() => router.push("/")} className="cursor-pointer text-xs font-bold text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
            🏠 แอดมิน
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {products.map(product => (
            <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              <div className="relative aspect-square bg-gray-50 p-4">{product.image_url ? <Image src={product.image_url} alt={product.name} fill className="object-contain" /> : <div className="w-full h-full flex items-center justify-center text-gray-300">No Image</div>}</div>
              <div className="p-3 flex-1 flex flex-col">
                <h3 className="font-bold text-gray-800 text-sm line-clamp-2">{product.name}</h3>
                <div className="mt-auto pt-2 flex justify-between items-end">
                  <span className="font-black text-blue-600 text-sm">{product.sell_price.toFixed(2)} ฿</span>
                  <button onClick={() => addToCart(product)} className="cursor-pointer bg-blue-600 text-white w-8 h-8 rounded-full font-bold flex items-center justify-center shadow-md active:scale-95">+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
      {cart.length > 0 && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-20">
          <div className="max-w-3xl mx-auto p-4 flex justify-between items-center">
            <div><p className="text-xs text-gray-400 font-bold">ตะกร้าสินค้า ({cart.length} รายการ)</p><p className="text-2xl font-black text-blue-600">{totalAmount.toFixed(2)} ฿</p></div>
            <button onClick={() => { setShowCheckout(true); setStep("form"); }} className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg text-sm">ดูตะกร้าสินค้า →</button>
          </div>
        </div>
      )}
      {showCheckout && (
        <div className="fixed inset-0 bg-gray-100 z-50 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-white min-h-screen flex flex-col shadow-2xl">
            <header className="p-4 border-b flex items-center sticky top-0 bg-white z-10">
              <button onClick={() => setShowCheckout(false)} className="cursor-pointer text-2xl font-bold text-gray-600 mr-4">←</button>
              <h2 className="text-lg font-black text-gray-800">{step === "form" ? "ยืนยันคำสั่งซื้อและที่อยู่" : "สแกนและแนบสลิปชำระเงิน"}</h2>
            </header>
            <div className="flex-1 p-4 pb-32">
              {step === "form" ? (
                <>
                  <h3 className="font-bold text-gray-700 mb-3 text-sm">รายการสินค้า</h3>
                  <div className="space-y-3 mb-6">
                    {cart.map(item => (
                      <div key={item.id} className="bg-gray-50 p-3 rounded-xl border">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 pr-2"><h4 className="font-bold text-sm">{item.name}</h4><p className="font-black text-blue-600 text-sm">{item.sell_price.toFixed(2)} ฿</p></div>
                          <div className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1">
                            <button onClick={() => updateQty(item.id, -1)} className="cursor-pointer font-bold text-gray-500 w-6 h-6">-</button>
                            <span className="font-black text-sm w-4 text-center">{item.cart_qty}</span>
                            <button onClick={() => updateQty(item.id, 1)} className="cursor-pointer font-bold text-blue-600 w-6 h-6">+</button>
                            <button onClick={() => removeFromCart(item.id)} className="cursor-pointer text-red-500 font-bold text-xs pl-2 border-l">ลบ</button>
                          </div>
                        </div>
                        <input type="text" placeholder="หมายเหตุ (เช่น หวานน้อย)..." value={item.remark} onChange={(e) => updateRemark(item.id, e.target.value)} className="w-full text-xs p-2 border rounded-lg outline-none focus:border-blue-400 bg-white" />
                      </div>
                    ))}
                  </div>
                  <h3 className="font-bold text-gray-700 mb-3 text-sm">ข้อมูลการจัดส่ง</h3>
                  <form id="order-form" onSubmit={handleProceedToPayment} className="space-y-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">ชื่อผู้รับ</label><input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-3 border rounded-xl bg-gray-50 outline-none" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">เบอร์โทรศัพท์</label><input required type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-3 border rounded-xl bg-gray-50 outline-none" /></div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-gray-500">ที่อยู่จัดส่ง / พิกัด GPS</label>
                        <button type="button" onClick={handleGetLocation} className="cursor-pointer text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md">📍 แชร์พิกัด</button>
                      </div>
                      <textarea required value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full p-3 border rounded-xl bg-gray-50 outline-none" rows={3} />
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-4">
                  <h3 className="font-bold text-gray-800 mb-1">สแกนเพื่อชำระเงิน</h3>
                  <p className="text-xs text-gray-500 mb-4">ยอดชำระสุทธิ: <span className="font-black text-blue-600 text-lg">{totalAmount.toFixed(2)} ฿</span></p>
                  {storeSettings?.promptpay_number ? (
                    <div className="bg-white p-4 rounded-2xl shadow-md border mb-6"><QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={200} /></div>
                  ) : <p className="text-red-500 text-xs mb-6 font-bold">ร้านค้านี้ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>}
                  
                  <div className="w-full max-w-xs bg-gray-50 border p-4 rounded-xl mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">อัปโหลดสลิปโอนเงิน <span className="text-red-500">*</span></label>
                    <input type="file" accept="image/*" onChange={handleSlipUpload} className="cursor-pointer w-full text-xs" />
                    {slipImage && <div className="mt-3 relative w-full h-40 border rounded-lg overflow-hidden bg-white"><img src={slipImage} alt="Slip" className="w-full h-full object-contain" /></div>}
                  </div>
                </div>
              )}
            </div>
            <div className="fixed bottom-0 left-0 right-0 max-w-3xl mx-auto bg-white p-4 border-t shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
              <div className="flex justify-between items-center mb-3"><span className="font-bold text-gray-600 text-sm">ยอดชำระสุทธิ</span><span className="text-2xl font-black text-blue-600">{totalAmount.toFixed(2)} ฿</span></div>
              {step === "form" ? (
                <button form="order-form" type="submit" className="cursor-pointer w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg">ไปหน้าชำระเงิน (QR Code) →</button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setStep("form")} className="cursor-pointer flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl">← กลับ</button>
                  <button onClick={handleFinalSubmitOrder} disabled={isSubmitting || !slipImage} className="cursor-pointer flex-[2] bg-green-600 disabled:bg-green-300 text-white font-bold py-3.5 rounded-xl shadow-lg">
                    {isSubmitting ? "กำลังส่งออเดอร์..." : "✅ ส่งออเดอร์ให้ร้าน"}
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
