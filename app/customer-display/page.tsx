"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface CartItem { id: string; name: string; price: number; cart_qty: number; remark?: string; image_url?: string; }
interface StoreSettings { name: string; promptpay_number: string; logo_url?: string; }

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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    const fetchStoreData = async () => {
      const { data } = await supabase.from("stores").select("*").limit(1).single();
      if (data) setStoreSettings(data);
    };
    fetchStoreData();

    const channel = supabase.channel('pos_sync_channel');
    channel.on('broadcast', { event: 'cart_update' }, (payload) => {
      setCart(payload.payload.cart);
      setTotalAmount(payload.payload.totalAmount);
      setPaymentMethod(payload.payload.paymentMethod);
      setShowCheckout(payload.payload.showCheckout);
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <div className="w-2/3 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-blue-600 text-white flex items-center gap-4 shrink-0 shadow-md">
          {storeSettings?.logo_url && <img src={storeSettings.logo_url} alt="Logo" className="w-16 h-16 rounded-full object-cover border-2 border-white bg-white" />}
          <div>
            <h1 className="text-3xl font-black tracking-tight">{storeSettings?.name || "ยินดีต้อนรับ"}</h1>
            <p className="text-blue-200 font-medium">รายการสินค้าที่คุณสั่งซื้อ</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <span className="text-8xl mb-6">🛒</span>
              <p className="text-3xl font-bold">ยังไม่มีสินค้าในตะกร้า</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 font-black text-2xl rounded-xl flex items-center justify-center shrink-0">
                    {item.cart_qty}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800">{item.name}</h3>
                    {item.remark && <p className="text-orange-500 font-bold text-lg">- {item.remark}</p>}
                  </div>
                </div>
                <div className="text-2xl font-black text-gray-800">
                  ฿{(item.price * item.cart_qty).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="w-1/3 bg-gray-50 flex flex-col items-center justify-center p-8">
        {!showCheckout ? (
          <div className="w-full bg-white p-8 rounded-3xl shadow-lg border border-gray-100 text-center animate-fade-in">
            <p className="text-2xl font-bold text-gray-500 mb-2">ยอดรวมทั้งสิ้น</p>
            <p className="text-7xl font-black text-blue-600 tracking-tighter">฿{totalAmount.toLocaleString()}</p>
          </div>
        ) : (
          <div className="w-full bg-white p-8 rounded-3xl shadow-2xl border-2 border-blue-100 flex flex-col items-center animate-fade-in-up">
            <h2 className="text-3xl font-black text-gray-800 mb-2">ยอดที่ต้องชำระ</h2>
            <p className="text-6xl font-black text-blue-600 tracking-tighter mb-8">฿{totalAmount.toLocaleString()}</p>
            
            {paymentMethod === "transfer" ? (
              <div className="flex flex-col items-center">
                {storeSettings?.promptpay_number ? (
                  <div className="bg-white p-4 rounded-3xl shadow-inner border border-gray-200">
                    <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={280} />
                  </div>
                ) : <p className="text-red-500 text-xl font-bold">ร้านค้านี้ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>}
                <p className="mt-6 text-xl font-bold text-blue-800 bg-blue-50 px-6 py-2 rounded-full">📱 สแกน QR Code เพื่อโอนเงิน</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <span className="text-8xl mb-4">💵</span>
                <p className="text-3xl font-bold text-gray-700">กรุณาชำระด้วยเงินสด</p>
                <p className="text-xl text-gray-500 mt-2">ที่เคาน์เตอร์</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}