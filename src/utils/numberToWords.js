/**
 * Converts a numeric amount to Indian English words.
 * E.g., 150500 -> "One Lakh Fifty Thousand Five Hundred Rupees Only"
 */
function numberToWords(num) {
    const value = Math.floor(Number(num));
    if (isNaN(value) || value < 0) return "Zero Rupees Only";
    if (value === 0) return "Zero Rupees Only";

    const singleDigits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teenDigits = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tensMultiple = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    let words = "";

    // Helper to convert numbers less than 1000
    function convertLessThanOneThousand(n) {
        let temp = "";
        if (n >= 100) {
            temp += singleDigits[Math.floor(n / 100)] + " Hundred ";
            n %= 100;
        }
        if (n >= 10 && n < 20) {
            temp += teenDigits[n - 10] + " ";
        } else if (n >= 20) {
            temp += tensMultiple[Math.floor(n / 10)] + " " + singleDigits[n % 10] + " ";
        } else if (n > 0) {
            temp += singleDigits[n] + " ";
        }
        return temp;
    }

    let remaining = value;

    // Crores (1,00,00,000)
    if (remaining >= 10000000) {
        const crores = Math.floor(remaining / 10000000);
        words += convertLessThanOneThousand(crores) + "Crore ";
        remaining %= 10000000;
    }

    // Lakhs (1,00,000)
    if (remaining >= 100000) {
        const lakhs = Math.floor(remaining / 100000);
        words += convertLessThanOneThousand(lakhs) + "Lakh ";
        remaining %= 100000;
    }

    // Thousands (1,000)
    if (remaining >= 1000) {
        const thousands = Math.floor(remaining / 1000);
        words += convertLessThanOneThousand(thousands) + "Thousand ";
        remaining %= 1000;
    }

    // Hundreds & Tens & Units
    if (remaining > 0) {
        words += convertLessThanOneThousand(remaining);
    }

    return (words.trim() + " Rupees Only").replace(/\s+/g, " ");
}

module.exports = numberToWords;
