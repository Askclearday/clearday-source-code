import { Platform } from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

// Configuration - Replace with your RevenueCat API Keys
const API_KEYS = {
  apple: "appl_api_key_here",
  google: "goog_rcVUolcPYbJdMCboFpKbDaoezbm"

};

export class RevenueService {
  private static instance: RevenueService;
  
  static async initialize() {
    try { 
      if (Platform.OS === 'ios') {
        Purchases.configure({ apiKey: API_KEYS.apple });
      } else {   
        Purchases.configure({ apiKey: API_KEYS.google });
      }
    } catch (e) {
      console.error("RevenueCat initialization failed", e);
    }
  }

  static async isUserPro(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      // Updated to match your Dashboard Identifier: "Luna Scroll Premium"
      return customerInfo.entitlements.active['Luna Scroll Premium'] !== undefined;
    } catch (e) {
      return false;
    }
  }

  static async getOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      
      // Try the offering explicitly marked as 'current' in RC Dashboard
      if (offerings.current !== null) {
        return offerings.current.availablePackages;
      }
      
      // Fallback: Check for the specific "Luna Pro" offering ID seen in your screenshots
      if (offerings.all['Luna Pro']) {
        return offerings.all['Luna Pro'].availablePackages;
      }

      // Final fallback: Get packages from any available offering
      const allOfferings = Object.values(offerings.all);
      if (allOfferings.length > 0) {
        return allOfferings[0].availablePackages;
      }

      return [];
    } catch (e) {
      console.error("Error fetching offerings:", e);
      return [];
    }
  }

  static async purchasePackage(pack: PurchasesPackage) {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      // Verify using the correct Entitlement ID
      return customerInfo.entitlements.active['Luna Scroll Premium'] !== undefined;
    } catch (e: any) {
      // Check if the user cancelled the purchase
      if (e.userCancelled) {
        return false;
      }
      throw e;
    }
  }

  static async restorePurchases(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.restorePurchases();
      return customerInfo.entitlements.active['Luna Scroll Premium'] !== undefined;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
}