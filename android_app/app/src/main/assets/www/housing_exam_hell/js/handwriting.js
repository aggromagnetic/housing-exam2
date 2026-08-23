/**
 * Housing Exam Hell - Korean Handwriting Recognition Engine (Google Input Tools API)
 * Converts stylus / touch ink strokes into Korean words and numbers in real-time.
 */

export const HandwritingRecognizer = {
    async recognize(strokes, width = 400, height = 200) {
        if (!strokes || strokes.length === 0) return [];

        const formattedInk = strokes.map(stroke => {
            const xs = [];
            const ys = [];
            const ts = [];
            stroke.forEach(pt => {
                xs.push(Math.round(pt.x));
                ys.push(Math.round(pt.y));
                ts.push(Math.round(pt.t || 0));
            });
            return [xs, ys, ts];
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const res = await fetch('https://inputtools.google.com/request?itc=ko-t-i0-handwrit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_version: 0.4,
                    api_level: '537.36',
                    device: 'web',
                    input_type: '0',
                    options: 'enable_pre_space',
                    requests: [{
                        writing_guide: { writing_area_width: width, writing_area_height: height },
                        ink: formattedInk,
                        language: 'ko'
                    }]
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) return [];
            const data = await res.json();
            if (Array.isArray(data) && data[0] === 'SUCCESS' && data[1] && data[1][0] && Array.isArray(data[1][0][1])) {
                return data[1][0][1]; // Array of candidate strings
            }
        } catch (err) {
            console.warn('Handwriting API fetch error:', err);
        }
        return [];
    }
};
