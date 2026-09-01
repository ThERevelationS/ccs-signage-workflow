import React from "react";
import CyclingImage from "./CyclingImage";

const BASE = "https://media.base44.com/images/public/68a5a85045cf8570330146ef/";

const SIZES = [
  {
    id: "extra_small",
    label: "XS",
    range: '2"-8"',
    example: "Door / suite plaque",
    images: [
      "555cbbeca", "47cc68c3c", "0ae8a25a5", "86981777e", "595485382",
      "fca2b7964", "81c712070", "850521dd1", "fe029cb70", "612e64f5f",
    ],
  },
  {
    id: "small",
    label: "Small",
    range: '8"-12"',
    example: "Window / shop sign",
    images: [
      "e2e2d9788", "c8c64cc17", "d1f219407", "319d90fc6", "4b34667b7",
      "ba5486827", "e4ce924fb", "7a979f1a5", "f96f64467",
    ],
  },
  {
    id: "medium",
    label: "Medium",
    range: '12"-24"',
    example: "Standard storefront",
    images: [
      "f75172321", "5deeae55b", "32e8d9f84", "3ff95f7ac", "23d74bd82",
      "0d047f81d", "dbd1cb24e", "56f698c81", "e34477987", "5cb8deeb8",
    ],
  },
  {
    id: "large",
    label: "Large",
    range: '24"-48"',
    example: "Building façade",
    images: [
      "61ed95929", "1015872f4", "ee23edf18", "c6d1d57da", "e458fd3e2",
      "b1bad6ab4", "8b04ed34e", "5cbe67a69", "1133885b1", "f36e8b4cc",
    ],
  },
  {
    id: "extra_large",
    label: "XL",
    range: '48"-60"',
    example: "Highway-visible sign",
    images: [
      "0a7924cfe", "edaf2fcd6", "78a3b5323", "6d0ba4af5", "fa9670076",
      "a5e6bb7d1", "10e103fd9", "68799ccfd", "e5b918e05", "3911df154",
    ],
  },
  {
    id: "extra_extra_large",
    label: "XXL",
    range: '60"+',
    example: "Monument / tower sign",
    images: [
      "918d12caf", "0fd09f6ba", "430500a5c", "72eb52e51", "985bb14fd",
      "dceb534d3", "8ddf701e5", "ec2aad86d", "684f4bda2", "e8fa5c330",
    ],
  },
].map(s => ({ ...s, images: s.images.map(id => `${BASE}${id}_generated_image.png`) }));

export default function LetterSizePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
      {SIZES.map(s => {
        const selected = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`relative rounded-lg border-2 transition-all overflow-hidden text-left ${
              selected
                ? "border-purple-500 bg-purple-50 text-purple-900 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
            title={`${s.range} — ${s.example}`}
          >
            <CyclingImage
              images={s.images}
              alt={`${s.label} channel letters`}
              className="w-full aspect-[4/3]"
              intervalMs={10000}
            />
            <div className="p-1.5 text-center">
              <div className="text-[11px] font-semibold">{s.label}</div>
              <div className="text-[9px] opacity-70">{s.range}</div>
              <div className="text-[8px] opacity-60 leading-tight mt-0.5">{s.example}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}