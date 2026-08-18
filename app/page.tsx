"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface StoreData { name?: string; logo_url?: string; }
interface ProductData { id: string | number; name?: string; price?: number; image_url?: string; }
interface CartItem extends ProductData { quantity: number; }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default function POSPage() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!supabase) { 
        console.error("ไม่พบกุญแจเชื่อมต่อ Supabase"); 
        setIsLoading(false); 
        return; 
      }
      try {
        const { data: storeData } = await supabase.from("stores").select("*").limit(1).single();
        if (storeData) setStore(storeData);
        const { data: productData } = await supabase.from("products").select("*");
        if (productData) setProducts(productData);
      } catch (err) { 
        console.error(err); 
      } finally { 
        setIsLoading(false); 
      }
    }
    fetchData();
  }, []);

  const addToCart = (product: ProductData) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) return prevCart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const decreaseQuantity = (productId: string | number) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === productId);
      if (existing?.quantity === 1) return prevCart.filter((item) => item.id !== productId);
      return prevCart.map((item) => item.id === productId ? { ...item, quantity: item.quantity - 1 } : item);
    });
  };

  const totalPrice = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || !supabase) return;
    setIsSubmitting(true);

    try {
      let lat: number | null = null;
      let lng: number | null = null;

      if ("geolocation" in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (geoError) {
          console.warn("ไม่สามารถดึง GPS ได้:", geoError);
        }
      }

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([{ total_price: totalPrice, latitude: lat, longitude: lng }])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: orderData.id,
        product_name: item.name || "Unknown Product",
        quantity: item.quantity,
        price: item.price || 0
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      alert(`บันทึกคำสั่งซื้อสำเร็จ!\nยอดรวม: ฿${totalPrice.toLocaleString()}\nพิกัด GPS: ${lat ? "บันทึกแล้ว" : "ไม่ได้ระบุ"}`);
      setCart([]);
      setIsMobileCartOpen(false);

    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการบันทึกบิล:", error);
      alert("เกิดข้อผิดพลาดในการสั่งซื้อ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-400">กำลังโหลดระบบ POS...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans pb-24 md:pb-0">
      <header className="bg-white shadow-sm px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {store?.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={store.logo_url} alt="Logo" className="w-12 h-12 rounded-md object-contain" />
          ) : (
            <div className="w-12 h-12 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xl">{store?.name ? store.name.charAt(0) : "S"}</div>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-gray-800 tracking-tight">{store?.name || "Standard POS"}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-6 md:overflow-hidden">
        <div className="flex-1 md:overflow-y-auto md:pr-2">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {products.map((product) => (
              <div key={product.id} onClick={() => addToCart(product)} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center cursor-pointer active:scale-95 hover:shadow-md">
                <div className="w-full aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-gray-100">
                  {product.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={product.image_url} alt="Product" className="w-full h-full object-cover" />
                  ) : (
                    "ไม่มีรูป"
                  )}
                </div>
                <h3 className="font-semibold text-center text-sm md:text-base line-clamp-2 min-h-[2.5rem] w-full">{product.name || "ไม่มีชื่อ"}</h3>
                <p className="text-blue-600 font-extrabold mt-1 text-base">฿{(product.price || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`${isMobileCartOpen ? "fixed inset-0 z-50 flex" : "hidden"} md:flex w-full md:w-[350px] lg:w-[400px] flex-col bg-gray-900/50 md:bg-transparent`}>
          <div className="bg-white w-full h-full md:h-[calc(100vh-120px)] md:rounded-2xl shadow-2xl md:shadow-sm border-0 md:border flex flex-col mt-auto md:mt-0 rounded-t-3xl md:sticky md:top-6 overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 md:bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">🛒 ตะกร้า <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm">{totalItems}</span></h2>
              <button className="md:hidden w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full font-bold" onClick={() => setIsMobileCartOpen(false)}>X</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
              {cart.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 text-sm border-2 border-dashed rounded-xl">ยังไม่ได้เลือกสินค้า</div> : 
                <div className="flex flex-col gap-3">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-xl border shadow-sm">
                      <div className="flex-1">
                        <p className="font-semibold text-sm line-clamp-1">{item.name}</p>
                        <p className="text-blue-600 text-sm font-bold">฿{item.price?.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3 bg-gray-100 px-2 py-1 rounded-lg">
                        <button onClick={() => decreaseQuantity(item.id)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm font-bold active:scale-90">-</button>
                        <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-6 h-6 flex items-center justify-center bg-blue-600 rounded text-white shadow-sm font-bold active:scale-90">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>

            <div className="border-t p-4 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-10">
              <div className="flex justify-between font-bold text-lg mb-4"><span>ยอดรวม</span><span className="text-blue-600">฿{totalPrice.toLocaleString()}</span></div>
              <button 
                onClick={handleCheckout}
                className={`w-full py-3.5 rounded-xl font-bold text-lg transition-all shadow-lg ${totalItems > 0 && !isSubmitting ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                disabled={totalItems === 0 || isSubmitting}
              >
                {isSubmitting ? "กำลังบันทึก..." : "ยืนยันคำสั่งซื้อ"}
              </button>
            </div>
          </div>
        </div>
      </main>

      {!isMobileCartOpen && (
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t p-4 px-6 flex justify-between items-center z-40 pb-6">
          <div><p className="text-xs text-gray-500 font-semibold mb-0.5">รวม {totalItems} รายการ</p><p className="text-xl font-extrabold text-blue-600">฿{totalPrice.toLocaleString()}</p></div>
          <button onClick={() => setIsMobileCartOpen(true)} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg active:scale-95">ดูตะกร้า</button>
        </div>
      )}
    </div>
  );
}