
import Product from "@/lib/models/product.model";
import { connectToDB } from "@/lib/mongoose"
import { generateEmailBody, sendEmail } from "@/lib/nodemailer/index";
import { scrapeAmazonProduct } from "@/lib/scraper/index";
import { getAveragePrice, getEmailNotifType, getHighestPrice, getLowestPrice } from "@/lib/utils";
import { NextResponse } from "@/node_modules/next/server";
import { User } from "@/types/index";

export async function GET() {
    try {
        connectToDB();

        const products = await Product.find({});

        if(!products) throw new Error("No products found");

        //1. Scrape latest product details & update DB
        const updateProducts = await Promise.all(
            products.map(async (currentProduct: { url: any; priceHistory: any; _id?: string | undefined; currency?: string; image?: string; title?: string; currentPrice?: number; originalPrice?: number; highestPrice?: number; lowestPrice?: number; averagePrice?: number; discountRate?: number; description?: string; category?: string; reviewsCount?: number; stars?: number; isOutOfStock?: Boolean; users?: User[] | undefined; }) => {
                //Scrape product
                const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);

                if(!scrapedProduct) throw new Error("No products found");

                const updatePriceHistory: any = [
                    ...currentProduct.priceHistory,
                    { price: scrapedProduct.currentPrice}
                ]
                
                const product = {
                    ...scrapedProduct,
                    priceHistory: updatePriceHistory,
                    lowestPrice: getLowestPrice(updatePriceHistory),
                    highestPrice: getHighestPrice(updatePriceHistory),
                    averagePrice: getAveragePrice(updatePriceHistory),
                };
                // Update Products in DB
                const updatedProduct = await Product.findOneAndUpdate(
                    { url: scrapedProduct.url },
                    product
                );

                //2. check each product's status and send updates accordingly
                const emailNotifType = getEmailNotifType(scrapedProduct, currentProduct)

                if(emailNotifType && updatedProduct.users.length > 0) {
                    const productInfo = {
                        title: updatedProduct.title,
                        url: updatedProduct.url,
                    }
                    const emailContent =  await generateEmailBody(productInfo, emailNotifType);

                    const userEmails = updatedProduct.users.map((user: any) => user.email)

                    await sendEmail(emailContent, userEmails);
                }

                return updatedProduct;
            })
        )
        return NextResponse.json({
            message: 'ok', data: updateProducts,
        });
    }catch (error) {
        throw new Error(`Error in GET: ${error}`)
    }
}