"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// 1. สร้างโครงสร้างข้อมูล (Interface) แทนการใช้ 'any' เพื่อให้ถูกต้องตามหลัก TypeScript
interface StoreData {
  name?: string;
  logo_url?: string;
}

interface ProductData {
  id: string | number;
  name?: string;
  price?: number;
  image_url?: string;
}

// เชื่อมต่อฐานข้อมูล Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default function POSPage() {
  // นำ Interface มาใช้งานแทน 'any'
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!supabase) {
        setErrorMsg("ไม่พบกุญแจเชื่อมต่อ Supabase กรุณาตรวจสอบ Environment Variables");
        setIsLoading(false);
        return;
      }

      try {
        // 2. ลบตัวแปร Error ที่ไม่ได้ใช้งานทิ้งไป
        const { data: storeData } = await supabase.from("stores").select("*").limit(1).single();
        if (storeData) setStore(storeData);

        const { data: productData } = await supabase.from("products").select("*");
        if (productData) setProducts(productData);
        
      } catch (err) {
        console.error("พบปัญหาในการดึงข้อมูล:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-xl font-bold text-gray-400">กำลังโหลดระบบ POS...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {store?.logo_url ? (
            /* 3. ปิดการแจ้งเตือนเรื่องแท็ก img ของ Next.js */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={store.logo_url} alt="Store Logo" className="w-12 h-12 rounded-md object-cover" />
          ) : (
            <div className="w-12 h-12 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xl shadow-inner">
              {store?.name ? store.name.charAt(0) : "บ"}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">
              {store?.name || "บริษัท นำพาความสุข จำกัด"}
            </h1>
            <p className="text-sm text-gray-500">Standard POS System</p>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4 rounded-lg">
          <p className="font-bold">แจ้งเตือนระบบ</p>
          <p>{errorMsg}</p>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-6 overflow-hidden">
        
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.length > 0 ? (
              // 4. ใช้ตัวแปร index แทน Math.random() เพื่อไม่ให้ผิดกฎของ React
              products.map((product, index) => (
                <div key={product?.id || index} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center hover:shadow-md cursor-pointer transition-all">
                  <div className="w-full aspect-square bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-gray-400 text-sm overflow-hidden border border-dashed border-gray-200">
                    {product?.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={product.image_url} alt={product.name || "Product"} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      "ไม่มีรูปภาพ"
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-800 text-center line-clamp-2 min-h-[3rem] mt-2">{product?.name || "สินค้าไม่มีชื่อ"}</h3>
                  <p className="text-blue-600 font-bold mt-1 text-lg">฿{(product?.price || 0).toLocaleString()}</p>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                ยังไม่มีข้อมูลสินค้าในฐานข้อมูล Supabase
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-[350px] bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-120px)] sticky top-6">
          <h2 className="text-xl font-bold mb-4 text-gray-800">🛒 ตะกร้าสินค้า</h2>
          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg mb-4 bg-gray-50">
            <span className="text-gray-400 text-sm">ลูกค้ายังไม่ได้เลือกสินค้า</span>
          </div>
          <div className="border-t pt-4">
            <div className="flex justify-between font-bold text-xl mb-4 text-gray-800">
              <span>ยอดรวมทั้งสิ้น</span>
              <span className="text-blue-600">฿0.00</span>
            </div>
            <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
              ยืนยันคำสั่งซื้อ
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}