import { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE } from "../constants/index.js";

export default function useCheatingMonitor(active, callId) {
    const [flags, setFlags] = useState([]);
    const [tabSwitches, setTabSwitches] = useState(0);
    const videoRef = useRef(null);
    const screenRef = useRef(null);
    const [camStream, setCamStream] = useState(null);
    const [screenStream, setScreenStream] = useState(null);
    const [camError, setCamError] = useState(null);
    const [screenError, setScreenError] = useState(null);

    const addFlag = useCallback((msg) => {
        const flag = { msg, time: new Date().toLocaleTimeString() };
        setFlags(f => [...f, flag]);

        // Also send to backend
        if (callId) {
            fetch(`${API_BASE}/flag/${callId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(flag),
            }).catch(() => { });
        }
    }, [callId]);

    useEffect(() => {
        if (!active) return;
        const handle = () => {
            if (document.hidden) {
                setTabSwitches(n => n + 1);
                addFlag("Tab switch / window blur detected");
            }
        };
        document.addEventListener("visibilitychange", handle);
        return () => document.removeEventListener("visibilitychange", handle);
    }, [active, addFlag]);

    const startCamera = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            setCamStream(s);
            if (videoRef.current) videoRef.current.srcObject = s;
            setCamError(null);
        } catch { setCamError("Camera denied"); }
    };

    const startScreen = async () => {
        try {
            const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
            setScreenStream(s);
            if (screenRef.current) screenRef.current.srcObject = s;
            s.getVideoTracks()[0].addEventListener("ended", () => {
                addFlag("Screen share stopped mid-interview");
                setScreenStream(null);
            });
            setScreenError(null);
        } catch { setScreenError("Screen share denied"); }
    };

    const stopAll = () => {
        camStream?.getTracks().forEach(t => t.stop());
        screenStream?.getTracks().forEach(t => t.stop());
        setCamStream(null);
        setScreenStream(null);
    };

    const setCamStreamDirect = (stream) => {
        setCamStream(stream);
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamError(null);
    };

    const setScreenStreamDirect = (stream) => {
        setScreenStream(stream);
        if (screenRef.current) screenRef.current.srcObject = stream;
        stream.getVideoTracks()[0].addEventListener("ended", () => {
            addFlag("Screen share stopped mid-interview");
            setScreenStream(null);
        });
        setScreenError(null);
    };

    return {
        flags, tabSwitches, videoRef, screenRef, camStream,
        screenStream, camError, screenError, startCamera,
        startScreen, stopAll, setCamStreamDirect, setScreenStreamDirect
    };
}
