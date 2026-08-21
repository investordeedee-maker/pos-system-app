"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface CartItem { id: string; name: string; price: number; cart_qty: number; remark?: string; image_url?: string; }
interface StoreSettings { name: string; promptpay_number: string; logo_url?: string; }
interface ProductImage { id: string; image_url: string; }

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

export default function CustomerDisplayPage() {
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<ProductImage[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [showCheckout, setShowCheckout] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      // 1. ดึงข้อมูลร้านค้า
      const { data: storeData } = await supabase.from("stores").select("*").limit(1).single();
      if (storeData) setStoreSettings(storeData);

      // 2. ดึงข้อมูลรูปภาพสินค้าทั้งหมดมารอไว้ เพื่อจับคู่กับตะกร้า
      const { data: prodData } = await supabase.from("products").select("id, image_url");
      if (prodData) setProducts(prodData);
    };
    fetchInitialData();

    // 📡 รอรับสัญญาณ (ที่ไม่มีรูปภาพ) แล้วเอามาจับคู่ภาพเอง
    const channel = supabase.channel('pos_sync_channel');
    channel.on('broadcast', { event: 'cart_update' }, (payload) => {
      if (payload.payload) {
        setCart(payload.payload.cart || []);
        setTotalAmount(payload.payload.totalAmount || 0);
        setPaymentMethod(payload.payload.paymentMethod || "cash");
        setShowCheckout(payload.payload.showCheckout || false);
      }
    }).subscribe();

    // 🖥️ ตรวจสอบสถานะ Fullscreen
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => { 
      supabase.removeChannel(channel); 
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

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

  return (
    <div className="flex h-[100dvh] bg-slate-50 font-sans overflow-hidden select-none">
      
      {/* ฝั่งซ้าย: รายการสินค้า */}
      <div className="w-[60%] bg-white border-r border-slate-200 flex flex-col shadow-2xl z-10 relative">
        
        {/* Header ฝั่งซ้าย */}
        <div className="p-6 md:p-8 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 shadow-sm z-20">
          <div className="flex items-center gap-5">
            {storeSettings?.logo_url ? (
              <img src={storeSettings.logo_url} alt="Logo" className="w-16 h-16 rounded-full object-cover border border-slate-200 shadow-sm" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-sm">
                {storeSettings?.name ? storeSettings.name.charAt(0) : "S"}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-800">{storeSettings?.name || "ยินดีต้อนรับ"}</h1>
              <p className="text-blue-600 font-bold mt-1">
                {showCheckout ? "กำลังดำเนินการชำระเงิน..." : "รายการสินค้าที่คุณสั่งซื้อ"}
              </p>
            </div>
          </div>
          
          {/* ปุ่ม Fullscreen มุมขวาบนของฝั่งซ้าย */}
          <button onClick={toggleFullscreen} className="cursor-pointer w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors active:scale-95">
            <span className="text-xl">{isFullscreen ? "🗗" : "🖵"}</span>
          </button>
        </div>
        
        {/* รายการตะกร้า */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 bg-slate-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <div className="w-40 h-40 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner text-7xl opacity-50">🛒</div>
              <p className="text-3xl font-bold text-slate-500">ยังไม่มีสินค้าในตะกร้า</p>
              <p className="text-slate-400 mt-2 font-medium">รอการทำรายการจากแคชเชียร์</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              // 🔍 จับคู่รูปภาพจากฐานข้อมูลที่ดึงมารอไว้
              const productImg = products.find(p => p.id === item.id)?.image_url;
              
              return (
                <div key={idx} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-5 transition-all animate-fade-in-up">
                  {productImg ? (
                    <img src={productImg} alt={item.name} className="w-24 h-24 rounded-2xl object-cover border border-slate-100 shrink-0 shadow-sm" />
                  ) : (
                    <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center text-4xl shrink-0 border border-slate-200 shadow-inner">📦</div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div className="pr-4">
                        <h3 className="text-2xl font-bold text-slate-800 line-clamp-2 leading-tight">{item.name}</h3>
                        {item.remark && (
                          <p className="text-orange-600 font-bold text-base mt-2 bg-orange-50 border border-orange-100 inline-block px-3 py-1 rounded-lg">
                            - {item.remark}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-3xl font-black text-blue-600">฿{(item.price * item.cart_qty).toLocaleString()}</p>
                        <p className="text-base font-bold text-slate-400 mt-1 bg-slate-50 px-3 py-1 rounded-lg inline-block">
                          {item.cart_qty} x ฿{item.price.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ฝั่งขวา: ยอดรวม และชำระเงิน */}
      <div className="w-[40%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 flex flex-col items-center justify-center p-8 relative shadow-inner">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>

        {!showCheckout ? (
          <div className="w-full bg-white/10 backdrop-blur-md p-12 rounded-[3rem] shadow-2xl text-center relative z-10 border border-white/20 transition-all duration-500">
            <p className="text-2xl font-bold text-blue-100 mb-4 uppercase tracking-wider">ยอดรวมทั้งสิ้น</p>
            <p className="text-7xl lg:text-8xl font-black text-white tracking-tighter drop-shadow-lg">
              ฿{totalAmount.toLocaleString()}
            </p>
            <div className="mt-12 border-t border-white/20 pt-8 flex items-center justify-center gap-3">
              <div className="w-3 h-3 bg-blue-300 rounded-full animate-ping"></div>
              <p className="text-blue-200 font-bold text-xl">รอแคชเชียร์สรุปยอด...</p>
            </div>
          </div>
        ) : (
          <div className="w-full bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col items-center relative z-10 animate-fade-in-up border-4 border-white">
            <div className="bg-blue-50 text-blue-600 border border-blue-100 px-6 py-2 rounded-full font-black text-lg mb-6 shadow-sm">
              กรุณาชำระเงิน
            </div>
            <h2 className="text-2xl font-bold text-slate-500 mb-2">ยอดที่ต้องชำระ</h2>
            <p className="text-6xl lg:text-7xl font-black text-slate-800 tracking-tighter mb-10">
              ฿{totalAmount.toLocaleString()}
            </p>
            
            {paymentMethod === "transfer" ? (
              <div className="flex flex-col items-center w-full">
                {storeSettings?.promptpay_number ? (
                  <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-slate-100 relative">
                    <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={280} />
                    <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-1.5 rounded-full font-bold shadow-md whitespace-nowrap text-sm">
                      รองรับแอปทุกธนาคาร
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-100 p-8 rounded-3xl w-full text-center">
                    <span className="text-5xl mb-4 block">⚠️</span>
                    <p className="text-red-600 text-xl font-bold">ร้านค้านี้ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>
                  </div>
                )}
                <div className="mt-10 text-xl font-bold text-slate-600 bg-slate-50 border border-slate-200 px-8 py-4 rounded-full shadow-sm flex items-center gap-3">
                  <span className="text-3xl text-blue-600">📱</span> สแกน QR Code เพื่อโอนเงิน
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-12 w-full bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 shadow-inner">
                <span className="text-8xl mb-8 animate-bounce">💵</span>
                <p className="text-4xl font-black text-slate-800">ชำระด้วยเงินสด</p>
                <p className="text-xl text-slate-500 mt-3 font-bold">ที่พนักงานแคชเชียร์</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}