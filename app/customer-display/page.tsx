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

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* ฝั่งซ้าย: รายการสินค้า */}
      <div className="w-[60%] bg-white border-r border-gray-200 flex flex-col shadow-2xl z-10">
        <div className="p-6 bg-blue-600 text-white flex items-center gap-5 shrink-0 shadow-md">
          {storeSettings?.logo_url ? (
            <img src={storeSettings.logo_url} alt="Logo" className="w-16 h-16 rounded-full object-cover border-2 border-white bg-white" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-800 flex items-center justify-center text-2xl font-bold border-2 border-white">
              {storeSettings?.name ? storeSettings.name.charAt(0) : "S"}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black tracking-tight">{storeSettings?.name || "ยินดีต้อนรับ"}</h1>
            <p className="text-blue-200 font-medium">{showCheckout ? "กำลังดำเนินการชำระเงิน..." : "รายการสินค้าที่คุณสั่งซื้อ"}</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <span className="text-8xl mb-6 opacity-50">🛒</span>
              <p className="text-3xl font-bold">ยังไม่มีสินค้าในตะกร้า</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              // 🔍 จับคู่รูปภาพจากฐานข้อมูลที่ดึงมารอไว้
              const productImg = products.find(p => p.id === item.id)?.image_url;
              
              return (
                <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 transition-all">
                  {productImg ? (
                    <img src={productImg} alt={item.name} className="w-20 h-20 rounded-xl object-cover border border-gray-100 shrink-0" />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center text-3xl shrink-0">📦</div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                        {item.remark && <p className="text-orange-500 font-bold text-base mt-1 bg-orange-50 inline-block px-2 py-0.5 rounded-lg">- {item.remark}</p>}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-2xl font-black text-gray-800">฿{(item.price * item.cart_qty).toLocaleString()}</p>
                        <p className="text-sm font-bold text-gray-500 mt-1">{item.cart_qty} x ฿{item.price.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ฝั่งขวา: ยอดรวม และชำระเงิน (ดีไซน์ Kiosk) */}
      <div className="w-[40%] bg-blue-600 flex flex-col items-center justify-center p-8 relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>

        {!showCheckout ? (
          <div className="w-full bg-white p-10 rounded-[2rem] shadow-2xl text-center relative z-10 transform transition-all duration-500 hover:scale-105">
            <p className="text-2xl font-bold text-gray-500 mb-2">ยอดรวมทั้งสิ้น</p>
            <p className="text-7xl font-black text-blue-600 tracking-tighter">฿{totalAmount.toLocaleString()}</p>
            <div className="mt-8 border-t border-dashed border-gray-200 pt-6">
              <p className="text-gray-400 font-medium animate-pulse">กำลังทำรายการ...</p>
            </div>
          </div>
        ) : (
          <div className="w-full bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center relative z-10 animate-fade-in-up border-4 border-blue-300">
            <div className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full font-bold text-sm mb-4">
              กรุณาชำระเงิน
            </div>
            <h2 className="text-3xl font-black text-gray-800 mb-2">ยอดที่ต้องชำระ</h2>
            <p className="text-6xl font-black text-blue-600 tracking-tighter mb-8">฿{totalAmount.toLocaleString()}</p>
            
            {paymentMethod === "transfer" ? (
              <div className="flex flex-col items-center w-full">
                {storeSettings?.promptpay_number ? (
                  <div className="bg-white p-4 rounded-3xl shadow-lg border-2 border-gray-100">
                    <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={260} />
                  </div>
                ) : (
                  <div className="bg-red-50 p-6 rounded-2xl w-full text-center">
                    <p className="text-red-500 text-xl font-bold">⚠️ ร้านค้านี้ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>
                  </div>
                )}
                <div className="mt-6 text-xl font-bold text-white bg-blue-600 px-8 py-3 rounded-full shadow-lg flex items-center gap-3">
                  <span className="text-2xl">📱</span> สแกน QR Code เพื่อโอนเงิน
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-10 w-full bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                <span className="text-9xl mb-6">💵</span>
                <p className="text-3xl font-bold text-gray-800">กรุณาชำระด้วยเงินสด</p>
                <p className="text-xl text-gray-500 mt-2 font-medium">ที่เคาน์เตอร์แคชเชียร์</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}