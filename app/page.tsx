"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// เชื่อมต่อฐานข้อมูล Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function POSPage() {
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      // 1. ดึงข้อมูลร้านค้า (ดึงข้อมูลแถวแรกมาเป็นร้านหลัก)
      const { data: storeData } = await supabase.from("stores").select("*").limit(1).single();
      if (storeData) setStore(storeData);

      // 2. ดึงแคตตาล็อกสินค้าทั้งหมด
      const { data: productData } = await supabase.from("products").select("*");
      if (productData) setProducts(productData);
    }
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      
      {/* --- ส่วนหัว (Header): ดึงชื่อและโลโก้ร้านมาแสดงแบบไดนามิก --- */}
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* ถ้ามีโลโก้ให้โชว์รูป ถ้าไม่มีให้โชว์ตัวอักษรตัวแรกของชื่อร้าน */}
          {store?.logo_url ? (
            <img src={store.logo_url} alt="Store Logo" className="w-12 h-12 rounded-md object-cover" />
          ) : (
            <div className="w-12 h-12 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xl shadow-inner">
              {store?.name ? store.name.charAt(0) : "S"}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">
              {store?.name || "กำลังโหลดชื่อร้าน..."}
            </h1>
            <p className="text-sm text-gray-500">ระบบ Standard POS</p>
          </div>
        </div>
      </header>

      {/* --- พื้นที่หลัก (Main Content) --- */}
      <main className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-6 overflow-hidden">
        
        {/* ด้านซ้าย: แคตตาล็อกสินค้า (ให้ลูกค้ากดเองได้) */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.length > 0 ? (
              products.map((product) => (
                <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
                  <div className="w-full aspect-square bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      "ไม่มีรูปภาพ"
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-800 text-center line-clamp-2 min-h-[3rem]">{product.name}</h3>
                  <p className="text-blue-600 font-bold mt-1 text-lg">฿{product.price.toLocaleString()}</p>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-400">
                ยังไม่มีสินค้าในระบบ กรุณาเพิ่มสินค้าใน Supabase
              </div>
            )}
          </div>
        </div>

        {/* ด้านขวา: ตะกร้าสินค้า (รอการเขียนระบบคำนวณ) */}
        <div className="w-full md:w-[350px] bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-120px)] sticky top-6">
          <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
            🛒 ตะกร้าสินค้า
          </h2>
          
          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-lg mb-4 bg-gray-50">
            <span className="text-gray-400 text-sm">ลูกค้ายังไม่ได้เลือกสินค้า</span>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between font-bold text-xl mb-4 text-gray-800">
              <span>ยอดรวมทั้งสิ้น</span>
              <span className="text-blue-600">฿0.00</span>
            </div>
            <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 text-lg">
              ยืนยันคำสั่งซื้อ
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}