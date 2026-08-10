# GooglePayReader 📱 

A React Native application built with Expo designed to help builders make integrated payment gateways directly using Google Pay Notifications.

This is the app part 📱


## 💡 Description
I wanted to use a payment gateway for my website (www.counsellus.in) but payment gateways required lengthy KYC verifications, documentation of registrations, upfront payment and a lot of private information. I was just starting out and did not want to go through so much hassle for a prototype. So I decided to solve this problem and create an indie payment gateway by using resources all of us have available. (Payment Gateways also take commission)

This led me to ideate and come up with a direct solution framework:

USER SEES QR IN WEBSITE (specialised qr containing user_id)-> USER PAYS -> NOTIFICATION IN PHONE -> PHONE SENDS RECEIPT TO BACKEND -> BACKEND VERIFIES PAYMENT AND LETS USER with user_id PROCEED

---

## ✨ Features

*   **[Feature 1]** - e.g., Real-time receipt scanning and text extraction.
*   **[Feature 2]** - e.g., Background listener with template user_id extraction feature.
*   **[Feature 3]** - e.g., No storage, no data leaks.

---

## 🚀 Tech Stack

*   **Framework:** [React Native](https://reactnative.dev/) with [Expo](https://expo.dev/)
*   **Language:** JavaScript / TypeScript
*   **State Management:** [Component State / Redux / Context API]
*   **Styling:** NativeWind / StyleSheet

---

## 🛠️ Getting Started

Follow these steps to set up the project locally on your machine. You can change the regex user_id /user_id_[a-zA-Z0-9]+_\d+/ to true for testing or replace it with your website's user_id format;

### Prerequisites

Make sure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18 or higher recommended)
*   [Git](https://git-scm.com/)
*   Expo Go app installed on your physical Android device (for testing)

### Installation

1. **Clone the repository:**
```bash
   git clone https://github.com/InventiveGit-12/GpayReader.git 
   cd GpayReader
   npm install --global eas-cli
   eas login
   eas build:configure
   eas build --platform android --profile development
  
