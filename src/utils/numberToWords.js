export const numberToIndianWords = (num) => {
    if (num === undefined || num === null || num === '') return '';
    let value = num;
    if (typeof num === 'object' && num !== null) {
        value = num.value;
    }
    try {
        const n = Number(value);
        if (isNaN(n)) return '';

        // Words conversion logic
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        const inWords = (num) => {
            if ((num = num.toString()).length > 9) return 'overflow';
            let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
            if (!n) return;
            let str = '';
            str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
            str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
            str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
            str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
            str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + '' : '';
            return str;
        };

        return inWords(Math.round(n));
    } catch (e) {
        console.error("Error converting number to words:", e);
        return '';
    }
};

export const formatIndianCurrency = (num) => {
    if (num === undefined || num === null || num === '') return '₹0';
    let value = num;
    if (typeof num === 'object' && num !== null) {
        value = num.value;
    }
    try {
        const n = Number(value);
        if (isNaN(n)) return '₹0';

        if (n >= 10000000) {
            return `₹${(n / 10000000).toFixed(2)} Cr`;
        } else if (n >= 100000) {
            return `₹${(n / 100000).toFixed(2)} Lac`;
        } else if (n >= 1000) {
            return `₹${(n / 1000).toFixed(2)} K`;
        } else {
            return `₹${n}`;
        }
    } catch (e) {
        return `₹${num}`;
    }
};
export const formatFullIndianAmount = (num) => {
    if (num === undefined || num === null || num === '') return '₹ 0/-';
    let value = num;
    if (typeof num === 'object' && num !== null) {
        value = num.value;
    }
    try {
        const n = Math.abs(Number(value));
        if (isNaN(n)) return '₹ 0/-';

        let x = Math.round(n).toString();
        let lastThree = x.substring(x.length - 3);
        let otherNumbers = x.substring(0, x.length - 3);
        if (otherNumbers !== '') lastThree = ',' + lastThree;
        let res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

        const sign = Number(num) < 0 ? '-' : '';
        return `${sign}₹ ${res}/-`;
    } catch (e) {
        return `₹ ${num}/-`;
    }
};
