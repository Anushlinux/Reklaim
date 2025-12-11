import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import "./style/home.css";
import DEFAULT_NO_IMAGE from "../assets/default_icon_listing.png";
import loaderGif from "../assets/loader.gif";
import axios from "axios";
import urlJoin from "url-join";

const EXAMPLE_MAIN_URL = window.location.origin;

export const Home = () => {
  const [pageLoading, setPageLoading] = useState(false);
  const [productList, setProductList] = useState([]);
  const { application_id, company_id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    isApplicationLaunch() ? fetchApplicationProducts() : fetchProducts();
  }, [application_id]);

  const fetchProducts = async () => {
    setPageLoading(true);
    try {
      const { data } = await axios.get(urlJoin(EXAMPLE_MAIN_URL, '/api/public/products'), {
        headers: {
          "x-company-id": company_id,
        }
      });
      setProductList(data.items);
    } catch (e) {
      console.error("Error fetching products:", e);
    } finally {
      setPageLoading(false);
    }
  };

  const fetchApplicationProducts = async () => {
    setPageLoading(true);
    try {
      const { data } = await axios.get(urlJoin(EXAMPLE_MAIN_URL, `/api/public/products/application/${application_id}`), {
        headers: {
          "x-company-id": company_id,
        }
      })
      setProductList(data.items);
    } catch (e) {
      console.error("Error fetching application products:", e);
    } finally {
      setPageLoading(false);
    }
  };

  const productProfileImage = (media) => {
    if (!media || !media.length) {
      return DEFAULT_NO_IMAGE;
    }
    const profileImg = media.find(m => m.type === "image");
    return profileImg?.url || DEFAULT_NO_IMAGE;
  };

  const isApplicationLaunch = () => !!application_id;

  const handleProductClick = (product) => {
    const basePath = isApplicationLaunch()
      ? `/company/${company_id}/application/${application_id}/returns/${product.id}`
      : `/company/${company_id}/returns/${product.id}`;

    navigate(basePath, {
      state: {
        product: {
          id: product.id,
          name: product.name,
          brand: product.brand?.name,
          image: productProfileImage(product.media),
          category: product.category_slug,
          itemCode: product.item_code,
          isActive: product.is_active
        }
      }
    });
  };

  const formatPrice = (product) => {
    // Try to get price from product data, fallback to a reasonable default
    if (product.price?.effective) {
      return `₹${product.price.effective.toLocaleString()}`;
    }
    if (product.price?.min) {
      return `₹${product.price.min.toLocaleString()}`;
    }
    return null;
  };

  const navigateToDashboard = () => {
    const basePath = application_id
      ? `/company/${company_id}/application/${application_id}/dashboard`
      : `/company/${company_id}/dashboard`;
    navigate(basePath);
  };

  const navigateToSettings = () => {
    const basePath = application_id
      ? `/company/${company_id}/application/${application_id}/settings`
      : `/company/${company_id}/settings`;
    navigate(basePath);
  };

  return (
    <>
      {pageLoading ? (
        <div className="home-loader" data-testid="loader">
          <img src={loaderGif} alt="loader GIF" />
          <span className="loader-text">Loading products...</span>
        </div>
      ) : (
        <div className="home-container">
          {/* Header */}
          <header className="home-header">
            <div className="header-content">
              <h1>Your Products</h1>
              <p>Select a product to initiate a return request</p>
            </div>
            <div className="header-actions">
              <button className="nav-action-button dashboard-button" onClick={navigateToDashboard}>
                📊 Dashboard
              </button>
              <button className="nav-action-button" onClick={navigateToSettings}>
                ⚙️ Settings
              </button>
              <div className="product-count-badge">
                {productList.length} {productList.length === 1 ? 'Product' : 'Products'}
              </div>
            </div>
          </header>

          {/* Product Grid */}
          {productList.length > 0 ? (
            <div className="products-grid">
              {productList.map((product, index) => (
                <div
                  key={`product-${product.id || index}`}
                  className="product-card"
                  onClick={() => handleProductClick(product)}
                  data-testid={`product-card-${product.id}`}
                >
                  {/* Status Badge */}
                  <div className={`status-indicator ${product.is_active ? 'active' : 'inactive'}`}>
                    {product.is_active ? 'Active' : 'Inactive'}
                  </div>

                  {/* Product Image */}
                  <div className="product-image-container">
                    <img
                      src={productProfileImage(product.media)}
                      alt={product.name}
                      className="product-image"
                    />
                  </div>

                  {/* Product Details */}
                  <div className="product-details">
                    <h3 className="product-name" data-testid={`product-name-${product.id}`}>
                      {product.name}
                    </h3>

                    {product.brand && (
                      <p className="product-brand" data-testid={`product-brand-${product.id}`}>
                        {product.brand.name}
                      </p>
                    )}

                    <div className="product-meta">
                      {product.category_slug && (
                        <span className="category-badge" data-testid={`product-category-${product.id}`}>
                          {product.category_slug}
                        </span>
                      )}
                    </div>

                    {formatPrice(product) && (
                      <p className="product-price">{formatPrice(product)}</p>
                    )}

                    {product.item_code && (
                      <p className="product-item-code" data-testid={`product-item-code-${product.id}`}>
                        Item Code: <span>{product.item_code}</span>
                      </p>
                    )}
                  </div>

                  {/* Action Hint */}
                  <div className="card-action-hint">
                    <span className="action-icon">↗</span>
                    Request Return
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <h3>No Products Found</h3>
              <p>There are no products available at the moment.</p>
            </div>
          )}

          {/* Footer */}
          <footer className="home-footer">
            <p>Click on any product to initiate a return request</p>
          </footer>
        </div>
      )}
    </>
  );
}
