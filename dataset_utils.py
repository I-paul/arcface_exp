import torch


def normalize_img(img):
    img = img.float()
    img = (img - 127.5) / 128.0
    return img.permute(2, 0, 1)

