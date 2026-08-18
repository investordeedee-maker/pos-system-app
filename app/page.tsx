"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// โครงสร้างข้อมูล
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

// โครงสร้างของชิ้นค้าในตะกร้า
interface CartItem extends ProductData {
  quantity: number;
}

// เชื่อมต่อฐานข้อมูล Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default function POSPage() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // สมองของระบบตะกร้า
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false); // ตัวเปิด/ปิดตะกร้าในมือถือ

  useEffect(() => {
    async function fetchData() {
      if (!supabase) {
        setErrorMsg("ไม่พบกุญแจเชื่อมต่อ Supabase");
        setIsLoading(false);
        return;
      }
      try {
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

  // ฟังก์ชัน: เพิ่มลงตะกร้า
  const addToCart = (product: ProductData) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        // ถ้ามีอยู่แล้วให้บวกจำนวนเพิ่ม
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      // ถ้ายังไม่มีให้เพิ่มสินค้าใหม่เข้าไป (จำนวน = 1)
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  // ฟังก์ชัน: ปรับลดจำนวน / ลบออกจากตะกร้า
  const decreaseQuantity = (productId: string | number) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === productId);
      if (existingItem?.quantity === 1) {
        return prevCart.filter((item) => item.id !== productId); // ลบทิ้งถ้าเหลือ 0
      }
      return prevCart.map((item) =>
        item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  };

  // คำนวณยอดรวม
  const totalPrice = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-xl font-bold text-gray-400">กำลังโหลดระบบ POS...</div>;
  }

  return (
    // เพิ่ม pb-24 เพื่อไม่ให้เนื้อหาในมือถือโดนแถบด้านล่างบัง
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans pb-24 md:pb-0">
      
      {/* ส่วนหัว (Header) */}
      <header className="bg-white shadow-sm px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {store?.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={store.logo_url} alt="Store Logo" className="w-12 h-12 rounded-md object-contain bg-white" />
          ) : (
            <div className="w-12 h-12 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xl shadow-inner">
              {store?.name ? store.name.charAt(0) : "S"}
            </div>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-gray-800 tracking-tight uppercase">
              {store?.name || "Standard POS"}
            </h1>
            <p className="text-xs md:text-sm text-gray-500">Standard POS System</p>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4 rounded-lg text-sm">
          <p>{errorMsg}</p>
        </div>
      )}

      {/* พื้นที่หลัก */}
      <main className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-6 md:overflow-hidden">
        
        {/* ด้านซ้าย: แคตตาล็อกสินค้า */}
        <div className="flex-1 md:overflow-y-auto md:pr-2">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {products.length > 0 ? (
              products.map((product, index) => (
                <div 
                  key={product?.id || index} 
                  onClick={() => addToCart(product)} // <--- สั่งให้กดแล้วเข้าตะกร้า
                  className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center cursor-pointer transition-all active:scale-95 hover:shadow-md hover:border-blue-300"
                >
                  <div className="w-full aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center text-gray-400 text-sm overflow-hidden border border-gray-100">
                    {product?.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={product.image_url} alt={product.name || "Product"} className="w-full h-full object-cover" />
                    ) : (
                      "ไม่มีรูป"
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-800 text-center text-sm md:text-base line-clamp-2 min-h-[2.5rem] md:min-h-[3rem] w-full">
                    {product?.name || "สินค้าไม่มีชื่อ"}
                  </h3>
                  <p className="text-blue-600 font-extrabold mt-1 text-base md:text-lg">
                    ฿{(product?.price || 0).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                ยังไม่มีข้อมูลสินค้า
              </div>
            )}
          </div>
        </div>

        {/* ด้านขวา: ตะกร้าสินค้า (รองรับ Responsive) */}
        {/* ในคอมโชว์ปกติ ในมือถือจะซ่อนไว้ และโชว์เมื่อกดปุ่มตะกร้า */}
        <div className={`
          ${isMobileCartOpen ? "fixed inset-0 z-50 flex" : "hidden"} 
          md:flex w-full md:w-[350px] lg:w-[400px] flex-col bg-gray-900/50 md:bg-transparent
        `}>
          <div className="bg-white w-full h-full md:h-[calc(100vh-120px)] md:rounded-2xl shadow-2xl md:shadow-sm border-0 md:border border-gray-100 flex flex-col mt-auto md:mt-0 rounded-t-3xl md:sticky md:top-6 overflow-hidden transition-transform">
            
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 md:bg-white">
              <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                🛒 ตะกร้าสินค้า <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm">{totalItems}</span>
              </h2>
              {/* ปุ่มปิดตะกร้า (เฉพาะมือถือ) */}
              <button 
                className="md:hidden w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full text-gray-600 font-bold"
                onClick={() => setIsMobileCartOpen(false)}
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
              {cart.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                  ยังไม่ได้เลือกสินค้า
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-xl border shadow-sm">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm line-clamp-1">{item.name}</p>
                        <p className="text-blue-600 text-sm font-bold">฿{item.price?.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3 bg-gray-100 px-2 py-1 rounded-lg">
                        <button onClick={() => decreaseQuantity(item.id)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 font-bold active:scale-90">-</button>
                        <span className="font-bold text-gray-800 text-sm w-4 text-center">{item.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-6 h-6 flex items-center justify-center bg-blue-600 rounded shadow-sm text-white font-bold active:scale-90">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t p-4 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-10">
              <div className="flex justify-between font-bold text-lg md:text-xl mb-4 text-gray-800">
                <span>ยอดรวม</span>
                <span className="text-blue-600">฿{totalPrice.toLocaleString()}</span>
              </div>
              <button 
                className={`w-full py-3.5 rounded-xl font-bold text-lg transition-all shadow-lg ${totalItems > 0 ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                disabled={totalItems === 0}
              >
                ยืนยันคำสั่งซื้อ
              </button>
            </div>
          </div>
        </div>

      </main>

      {/* แถบ Sticky Bottom Bar (เฉพาะมือถือ) */}
      {/* จะแสดงตลอดเวลาด้านล่างจอ เพื่อให้กดดูตะกร้าได้ง่ายๆ */}
      {!isMobileCartOpen && (
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4 px-6 flex justify-between items-center z-40 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-6">
          <div>
            <p className="text-xs text-gray-500 font-semibold mb-0.5">รวม {totalItems} รายการ</p>
            <p className="text-xl font-extrabold text-blue-600">฿{totalPrice.toLocaleString()}</p>
          </div>
          <button 
            onClick={() => setIsMobileCartOpen(true)} 
            className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold text-base shadow-lg shadow-blue-200 active:scale-95 transition-transform"
          >
            ดูตะกร้า
          </button>
        </div>
      )}

    </div>
  );
}